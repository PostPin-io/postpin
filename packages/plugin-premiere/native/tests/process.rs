//! The process table without UXP: what the panel relies on (macOS; Windows: tests/process_windows.rs)
#![cfg(unix)]

use postpin_process::process::{Output, ProcessTable, ensure_executable};
use std::time::{Duration, Instant};

/// Polls like the panel until the process ended, collecting its output
fn run_to_end(table: &mut ProcessTable, handle: i32) -> Output {
    let mut all = Output {
        running: true,
        ..Output::default()
    };
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        let out = table.poll(handle).expect("poll");
        all.stdout += &out.stdout;
        all.stderr += &out.stderr;
        if !out.running {
            all.running = false;
            all.exit_code = out.exit_code;
            all.signal = out.signal;
            return all;
        }
        assert!(Instant::now() < deadline, "process didn't end");
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn sh(table: &mut ProcessTable, script: &str) -> i32 {
    table
        .spawn("/bin/sh", &["-c".into(), script.into()])
        .expect("spawn")
}

#[test]
fn reports_output_and_exit_code_then_releases_the_handle() {
    let mut t = ProcessTable::new().unwrap();
    let h = sh(&mut t, "echo out; echo err >&2; exit 3");
    let out = run_to_end(&mut t, h);
    assert_eq!(
        (out.stdout.as_str(), out.stderr.as_str(), out.exit_code),
        ("out\n", "err\n", Some(3))
    );
    assert!(t.poll(h).is_err(), "handle released after the end");
}

#[test]
fn passes_arguments_unchanged() {
    let mut t = ProcessTable::new().unwrap();
    let args: Vec<String> = ["a b", "c\"d", "ü", "", "$HOME"].map(String::from).into();
    let h = t
        .spawn(
            "/usr/bin/printf",
            &[["%s|".to_string()].as_slice(), &args].concat(),
        )
        .unwrap();
    assert_eq!(run_to_end(&mut t, h).stdout, "a b|c\"d|ü||$HOME|");
}

#[test]
fn hands_large_output_over_in_several_polls() {
    let mut t = ProcessTable::new().unwrap();
    let h = sh(&mut t, "head -c 3000000 /dev/zero | tr '\\0' x");
    let out = run_to_end(&mut t, h);
    assert_eq!(out.stdout.len(), 3_000_000);
    assert_eq!(out.exit_code, Some(0));
}

#[test]
fn never_cuts_a_utf8_character() {
    let mut t = ProcessTable::new().unwrap();
    // "ü" is 0xC3 0xBC: the first byte, a pause, then the second
    let h = sh(&mut t, "printf '\\303'; sleep 0.3; printf '\\274'");
    let mut seen = Vec::new();
    loop {
        let out = t.poll(h).unwrap();
        if !out.stdout.is_empty() {
            seen.push(out.stdout);
        }
        if !out.running {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(seen, vec!["ü".to_string()]);
}

#[test]
fn stdin_is_empty() {
    let mut t = ProcessTable::new().unwrap();
    let h = t.spawn("/bin/cat", &[]).unwrap();
    assert_eq!(run_to_end(&mut t, h).exit_code, Some(0));
}

#[test]
fn kill_sends_sigterm_and_force_sigkill() {
    let mut t = ProcessTable::new().unwrap();
    let h = sh(&mut t, "sleep 30");
    assert!(t.kill(h, false));
    assert_eq!(run_to_end(&mut t, h).signal, Some(libc::SIGTERM));
    let h = sh(&mut t, "trap '' TERM; sleep 30");
    std::thread::sleep(Duration::from_millis(200));
    assert!(t.kill(h, true));
    assert_eq!(run_to_end(&mut t, h).signal, Some(libc::SIGKILL));
}

#[test]
fn kill_reaches_what_the_process_started() {
    let mut t = ProcessTable::new().unwrap();
    let h = sh(&mut t, "sleep 30 & echo $!; wait");
    let pid: i32 = loop {
        let out = t.poll(h).unwrap();
        if let Ok(pid) = out.stdout.trim().parse() {
            break pid;
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    assert!(t.kill(h, true));
    run_to_end(&mut t, h);
    std::thread::sleep(Duration::from_millis(100));
    assert_ne!(
        unsafe { libc::kill(pid, 0) },
        0,
        "the grandchild is gone too"
    );
}

#[test]
fn a_missing_binary_fails_to_start() {
    let mut t = ProcessTable::new().unwrap();
    let err = t.spawn("/nope/ffmpeg", &[]).unwrap_err();
    assert!(err.starts_with("Could not start /nope/ffmpeg"), "{err}");
}

#[test]
fn kill_all_ends_everything() {
    let mut t = ProcessTable::new().unwrap();
    let a = sh(&mut t, "sleep 30");
    let b = sh(&mut t, "sleep 30");
    t.kill_all();
    assert!(t.poll(a).is_err() && t.poll(b).is_err());
    assert!(!t.kill(a, true));
}

#[test]
fn ensure_executable_sets_the_bit() {
    use std::os::unix::fs::PermissionsExt;
    let dir = std::env::temp_dir().join(format!("pp-exec-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("tool");
    std::fs::write(&file, "#!/bin/sh\necho ok\n").unwrap();
    std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o644)).unwrap();
    ensure_executable(file.to_str().unwrap()).unwrap();
    assert_eq!(
        std::fs::metadata(&file).unwrap().permissions().mode() & 0o777,
        0o755
    );
    std::fs::remove_dir_all(dir).unwrap();
}

/// With FFMPEG=/path/to/ffmpeg: the progress lines the panel reads come through
#[test]
fn ffmpeg_progress_when_available() {
    let Ok(ffmpeg) = std::env::var("FFMPEG") else {
        return;
    };
    let mut t = ProcessTable::new().unwrap();
    let args =
        "-nostdin -progress pipe:1 -nostats -v error -f lavfi -i testsrc2=duration=1 -f null -";
    let h = t
        .spawn(
            &ffmpeg,
            &args.split(' ').map(String::from).collect::<Vec<_>>(),
        )
        .unwrap();
    let out = run_to_end(&mut t, h);
    assert_eq!(out.exit_code, Some(0), "{}", out.stderr);
    assert!(out.stdout.contains("out_time_us=") && out.stdout.contains("progress=end"));
}
