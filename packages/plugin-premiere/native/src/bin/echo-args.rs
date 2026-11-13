//! Test helper: prints the arguments it was started with, one per line. On Windows it splits its
//! command line with the C runtime's rules, like ffmpeg, so it shows what ffmpeg would receive.
fn main() {
    for arg in std::env::args().skip(1) {
        println!("{arg}");
    }
}
