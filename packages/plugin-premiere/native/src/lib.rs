//! UXP hybrid addon: lets the Premiere panel run ffmpeg and read its output.
//!
//! JS API (synchronous, called from UXP's scripting thread):
//!   spawn(path: string, args: string[]): number        starts a process, returns its handle
//!   poll(handle: number): { stdout, stderr, running, exitCode, signal }   never blocks
//!   kill(handle: number, force?: boolean): boolean      SIGTERM, or SIGKILL with force
//!   ensureExecutable(path: string): void                chmod +x on macOS
//!
//! The panel polls a few times a second, so no UXP value is ever touched off the scripting thread.

pub mod process;
mod uxp;

use process::ProcessTable;
use std::sync::{LazyLock, Mutex};
use uxp::{JsResult, addon_apis, addon_callback_info, addon_env, addon_value, guarded};

/// One table per loaded addon. A Mutex because uxp_addon_terminate runs on the main thread.
static PROCESSES: LazyLock<Mutex<Option<ProcessTable>>> = LazyLock::new(|| Mutex::new(None));

fn with_table<T>(f: impl FnOnce(&mut ProcessTable) -> Result<T, String>) -> Result<T, String> {
    let mut guard = PROCESSES
        .lock()
        .map_err(|_| "process table poisoned".to_string())?;
    if guard.is_none() {
        *guard = Some(ProcessTable::new()?);
    }
    f(guard.as_mut().expect("just created"))
}

unsafe extern "C" fn spawn(env: addon_env, info: addon_callback_info) -> addon_value {
    guarded(env, || -> JsResult {
        let (argv, argc) = uxp::args::<2>(env, info)?;
        if argc < 2 {
            return Err("spawn(path, args) needs two arguments".into());
        }
        let path = uxp::to_string(env, argv[0], "path")?;
        let args = uxp::to_strings(env, argv[1], "args")?;
        let handle = with_table(|t| t.spawn(&path, &args))?;
        uxp::from_i32(env, handle)
    })
}

unsafe extern "C" fn poll(env: addon_env, info: addon_callback_info) -> addon_value {
    guarded(env, || -> JsResult {
        let (argv, argc) = uxp::args::<1>(env, info)?;
        if argc < 1 {
            return Err("poll(handle) needs a handle".into());
        }
        let handle = uxp::to_i32(env, argv[0], "handle")?;
        let out = with_table(|t| t.poll(handle))?;
        uxp::object(
            env,
            &[
                (c"stdout", uxp::from_str(env, &out.stdout)?),
                (c"stderr", uxp::from_str(env, &out.stderr)?),
                (c"running", uxp::from_bool(env, out.running)?),
                (c"exitCode", uxp::from_opt_i32(env, out.exit_code)?),
                (c"signal", uxp::from_opt_i32(env, out.signal)?),
            ],
        )
    })
}

unsafe extern "C" fn kill(env: addon_env, info: addon_callback_info) -> addon_value {
    guarded(env, || -> JsResult {
        let (argv, argc) = uxp::args::<2>(env, info)?;
        if argc < 1 {
            return Err("kill(handle, force?) needs a handle".into());
        }
        let handle = uxp::to_i32(env, argv[0], "handle")?;
        let force = argc > 1 && uxp::to_bool(env, argv[1]);
        let killed = with_table(|t| Ok(t.kill(handle, force)))?;
        uxp::from_bool(env, killed)
    })
}

unsafe extern "C" fn ensure_executable(env: addon_env, info: addon_callback_info) -> addon_value {
    guarded(env, || -> JsResult {
        let (argv, argc) = uxp::args::<1>(env, info)?;
        if argc < 1 {
            return Err("ensureExecutable(path) needs a path".into());
        }
        process::ensure_executable(&uxp::to_string(env, argv[0], "path")?)?;
        uxp::undefined(env)
    })
}

/// Called by UXP when the plugin loads; the name and signature come from UxpAddonShared.h.
/// C++ declares the table as `addon_apis&&`, which every compiler passes as a pointer.
/// # Safety
/// UXP calls it once with a valid environment and its function table.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn uxp_addon_init(
    env: addon_env,
    exports: addon_value,
    apis: *const addon_apis,
) -> addon_value {
    if apis.is_null() {
        return exports;
    }
    uxp::set_apis(unsafe { *apis });
    guarded(env, || -> JsResult {
        uxp::export(env, exports, c"spawn", spawn)?;
        uxp::export(env, exports, c"poll", poll)?;
        uxp::export(env, exports, c"kill", kill)?;
        uxp::export(env, exports, c"ensureExecutable", ensure_executable)?;
        Ok(exports)
    })
}

/// Called by UXP when it unloads the plugin (reload, Premiere quits): no ffmpeg may outlive it
#[unsafe(no_mangle)]
pub extern "C" fn uxp_addon_terminate(_env: addon_env) {
    let _ = std::panic::catch_unwind(|| {
        if let Ok(mut table) = PROCESSES.lock()
            && let Some(t) = table.as_mut()
        {
            t.kill_all();
        }
    });
}
