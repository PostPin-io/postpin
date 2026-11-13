//! Child processes for the UXP addon. No UXP dependency, so `cargo test` covers all of it.
//!
//! A reader thread per pipe moves the output into a buffer; `poll` empties the buffers and never
//! blocks. The threads touch no UXP value, so the scripting thread rule holds.

use std::collections::HashMap;
use std::io::Read;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

/// Never hand more than this to JavaScript in one poll; the rest waits for the next one
const MAX_PER_POLL: usize = 1 << 20;

#[derive(Debug, Default, PartialEq)]
pub struct Output {
    pub stdout: String,
    pub stderr: String,
    pub running: bool,
    /// set once it ended normally
    pub exit_code: Option<i32>,
    /// set when a signal ended it (macOS)
    pub signal: Option<i32>,
}

/// One pipe: a thread reads it to its end into `buf`
struct Stream {
    buf: Arc<Mutex<Vec<u8>>>,
    reader: JoinHandle<()>,
}

impl Stream {
    fn new(mut source: impl Read + Send + 'static) -> Self {
        let buf = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&buf);
        let reader = std::thread::spawn(move || {
            let mut chunk = [0u8; 64 * 1024];
            // EOF or a read error: the child closed its end
            while let Ok(n @ 1..) = source.read(&mut chunk) {
                sink.lock().unwrap().extend_from_slice(&chunk[..n]);
            }
        });
        Self { buf, reader }
    }

    /// The pipe is closed and everything is in `buf`
    fn closed(&self) -> bool {
        self.reader.is_finished()
    }

    /// Takes what arrived, up to MAX_PER_POLL, without cutting a UTF-8 character in two
    fn take(&self) -> String {
        let closed = self.closed();
        let mut buf = self.buf.lock().unwrap();
        let limit = buf.len().min(MAX_PER_POLL);
        let cut = match std::str::from_utf8(&buf[..limit]) {
            Ok(_) => limit,
            // a character starts but isn't complete yet: keep it for the next poll,
            // unless nothing more can come
            Err(e) if e.error_len().is_none() && !(closed && limit == buf.len()) => e.valid_up_to(),
            // invalid bytes: hand them over as U+FFFD rather than stall
            Err(_) => limit,
        };
        let bytes: Vec<u8> = buf.drain(..cut).collect();
        String::from_utf8_lossy(&bytes).into_owned()
    }

    fn is_empty(&self) -> bool {
        self.buf.lock().unwrap().is_empty()
    }
}

struct Entry {
    child: Child,
    out: Stream,
    err: Stream,
    status: Option<ExitStatus>,
    /// try_wait failed (ECHILD): the host reaped the child itself, the exit status is lost
    reaped_elsewhere: bool,
}

pub struct ProcessTable {
    entries: HashMap<i32, Entry>,
    next_handle: i32,
    #[cfg(windows)]
    job: platform::Job,
}

impl ProcessTable {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            entries: HashMap::new(),
            next_handle: 1,
            #[cfg(windows)]
            job: platform::Job::new()?,
        })
    }

    /// Starts `path` with `args`; stdin is empty. Returns the handle for poll() and kill().
    pub fn spawn(&mut self, path: &str, args: &[String]) -> Result<i32, String> {
        let mut command = Command::new(path);
        command
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        platform::prepare(&mut command);
        let mut child = command
            .spawn()
            .map_err(|e| format!("Could not start {path}: {e}"))?;
        #[cfg(windows)]
        self.job.adopt(&child)?;
        let out = Stream::new(child.stdout.take().expect("piped"));
        let err = Stream::new(child.stderr.take().expect("piped"));
        let handle = self.next_handle;
        self.next_handle += 1;
        self.entries.insert(
            handle,
            Entry {
                child,
                out,
                err,
                status: None,
                reaped_elsewhere: false,
            },
        );
        Ok(handle)
    }

    /// Output since the last call. Once it reports the end, the handle is released.
    pub fn poll(&mut self, handle: i32) -> Result<Output, String> {
        let entry = self
            .entries
            .get_mut(&handle)
            .ok_or_else(|| format!("Unknown process handle {handle}"))?;
        if entry.status.is_none() && !entry.reaped_elsewhere {
            match entry.child.try_wait() {
                Ok(status) => entry.status = status,
                Err(_) => entry.reaped_elsewhere = true,
            }
        }
        let mut output = Output {
            stdout: entry.out.take(),
            stderr: entry.err.take(),
            running: true,
            ..Output::default()
        };
        // ended, and everything it wrote was read
        let ended = (entry.status.is_some() || entry.reaped_elsewhere)
            && entry.out.closed()
            && entry.err.closed()
            && entry.out.is_empty()
            && entry.err.is_empty();
        if ended {
            output.running = false;
            if let Some(status) = entry.status {
                output.exit_code = status.code();
                output.signal = platform::signal(&status);
            }
            self.entries.remove(&handle);
        }
        Ok(output)
    }

    /// Asks the process to end (SIGTERM), or ends it (force; Windows always). false: unknown or ended.
    pub fn kill(&mut self, handle: i32, force: bool) -> bool {
        match self.entries.get_mut(&handle) {
            Some(entry) if entry.status.is_none() => platform::kill(&mut entry.child, force),
            _ => false,
        }
    }

    /// Ends and reaps everything, e.g. when Premiere unloads the addon
    pub fn kill_all(&mut self) {
        for (_, mut entry) in self.entries.drain() {
            platform::kill(&mut entry.child, true);
            let _ = entry.child.wait();
        }
    }
}

impl Drop for ProcessTable {
    fn drop(&mut self) {
        self.kill_all();
    }
}

#[cfg(unix)]
mod platform {
    use std::os::unix::process::{CommandExt, ExitStatusExt};
    use std::process::{Child, Command, ExitStatus};

    pub fn prepare(command: &mut Command) {
        // own process group: kill() reaches whatever the child starts, too
        command.process_group(0);
    }

    pub fn kill(child: &mut Child, force: bool) -> bool {
        let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
        // negative pid: the whole process group
        unsafe { libc::kill(-(child.id() as libc::pid_t), signal) == 0 }
    }

    pub fn signal(status: &ExitStatus) -> Option<i32> {
        status.signal()
    }
}

#[cfg(windows)]
mod platform {
    use std::os::windows::io::AsRawHandle;
    use std::os::windows::process::CommandExt;
    use std::process::{Child, Command, ExitStatus};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
        SetInformationJobObject,
    };
    use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;

    pub fn prepare(command: &mut Command) {
        // no console window flashing up
        command.creation_flags(CREATE_NO_WINDOW);
    }

    pub fn kill(child: &mut Child, _force: bool) -> bool {
        // Windows has no SIGTERM: TerminateProcess
        child.kill().is_ok()
    }

    pub fn signal(_status: &ExitStatus) -> Option<i32> {
        None
    }

    /// A job that kills its processes once its last handle closes, also when Premiere crashes
    pub struct Job(HANDLE);
    // the handle is only used behind the table's Mutex
    unsafe impl Send for Job {}

    impl Job {
        pub fn new() -> Result<Self, String> {
            unsafe {
                let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if job.is_null() {
                    return Err("CreateJobObjectW failed".into());
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const _,
                    std::mem::size_of_val(&info) as u32,
                );
                if ok == 0 {
                    CloseHandle(job);
                    return Err("SetInformationJobObject failed".into());
                }
                Ok(Self(job))
            }
        }

        pub fn adopt(&self, child: &Child) -> Result<(), String> {
            let ok = unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) };
            if ok == 0 {
                Err("AssignProcessToJobObject failed".into())
            } else {
                Ok(())
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.0) };
        }
    }
}

/// macOS: sets the executable bit, which a .ccx (a zip) may lose. No-op on Windows.
pub fn ensure_executable(path: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = std::fs::metadata(path).map_err(|e| format!("{path}: {e}"))?;
        let mode = meta.permissions().mode();
        if mode & 0o111 != 0o111 {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode | 0o755))
                .map_err(|e| format!("chmod {path}: {e}"))?;
        }
    }
    #[cfg(windows)]
    let _ = path;
    Ok(())
}
