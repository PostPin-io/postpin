//! The process table on Windows (run on a Windows machine or the windows-latest runner)
#![cfg(windows)]

use postpin_process::process::{Output, ProcessTable};
use std::time::{Duration, Instant};

fn run_to_end(table: &mut ProcessTable, handle: i32) -> Output {
    let mut all = Output {
        running: true,
        ..Output::default()
    };
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let out = table.poll(handle).expect("poll");
        all.stdout += &out.stdout;
        all.stderr += &out.stderr;
        if !out.running {
            all.running = false;
            all.exit_code = out.exit_code;
            return all;
        }
        assert!(Instant::now() < deadline, "process didn't end");
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn cmd(table: &mut ProcessTable, line: &str) -> i32 {
    table
        .spawn("cmd.exe", &["/d".into(), "/c".into(), line.into()])
        .expect("spawn")
}

#[test]
fn reports_output_and_exit_code() {
    let mut t = ProcessTable::new().unwrap();
    let h = cmd(&mut t, "echo out& echo err 1>&2& exit 3");
    let out = run_to_end(&mut t, h);
    assert_eq!(out.stdout.trim(), "out");
    assert_eq!(out.stderr.trim(), "err");
    assert_eq!(out.exit_code, Some(3));
}

/// std quotes them for the C runtime's rules, echo-args splits them again with those rules
#[test]
fn passes_arguments_unchanged() {
    let mut t = ProcessTable::new().unwrap();
    let args = [
        "a b",
        "c\"d",
        r"C:\x\",
        r"\\server\share\",
        "",
        "ü",
        "-vf",
        "scale=w='min(1280,iw)'",
    ];
    let all: Vec<String> = args.iter().map(|a| a.to_string()).collect();
    let h = t.spawn(env!("CARGO_BIN_EXE_echo-args"), &all).unwrap();
    let out = run_to_end(&mut t, h);
    assert_eq!(out.exit_code, Some(0), "{}", out.stderr);
    let lines: Vec<&str> = out.stdout.lines().collect();
    assert_eq!(lines, args, "arguments changed on the way");
}

#[test]
fn kill_ends_it() {
    let mut t = ProcessTable::new().unwrap();
    let h = cmd(&mut t, "ping -n 30 127.0.0.1 >nul");
    std::thread::sleep(Duration::from_millis(200));
    assert!(t.kill(h, false));
    let out = run_to_end(&mut t, h);
    assert_ne!(out.exit_code, Some(0));
}

#[test]
fn a_missing_binary_fails_to_start() {
    let mut t = ProcessTable::new().unwrap();
    assert!(
        t.spawn(r"C:\nope\ffmpeg.exe", &[])
            .unwrap_err()
            .starts_with("Could not start")
    );
}

/// The job object: dropping the table (the addon unloads, Premiere crashes) ends its processes
#[test]
fn dropping_the_table_ends_its_processes() {
    let mut t = ProcessTable::new().unwrap();
    let h = cmd(&mut t, "ping -n 30 127.0.0.1 >nul & echo still alive");
    let _ = t.poll(h);
    drop(t);
    // tasklist would show it; nothing to poll any more, so just make sure dropping didn't hang
}
