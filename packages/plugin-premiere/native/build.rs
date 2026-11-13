// Generates Rust declarations for Adobe's UXP Hybrid SDK headers at build time, so nothing derived
// from the SDK is committed (see vendor/uxp-hybrid-sdk/SOURCE.md).
use std::{env, path::PathBuf};

fn main() {
    let sdk = PathBuf::from(
        env::var("UXP_HYBRID_SDK").unwrap_or_else(|_| "vendor/uxp-hybrid-sdk".into()),
    );
    let header = sdk.join("UxpAddonShared.h");
    if !header.exists() {
        panic!(
            "UXP Hybrid SDK headers missing in {}: see vendor/uxp-hybrid-sdk/SOURCE.md",
            sdk.display()
        );
    }
    println!("cargo:rerun-if-changed={}", sdk.display());
    println!("cargo:rerun-if-changed=wrapper.hpp");
    println!("cargo:rerun-if-changed=bindgen-include");
    println!("cargo:rerun-if-env-changed=UXP_HYBRID_SDK");

    let bindings = bindgen::Builder::default()
        .header("wrapper.hpp")
        // No system headers: the SDK only needs stdint/stddef/stdbool, which bindgen-include/
        // provides for any target. So the Windows bindings can be checked on a Mac, too.
        .clang_args([
            "-x",
            "c++",
            "-std=c++17",
            "-nostdinc",
            "-nostdinc++",
            "-Ibindgen-include",
        ])
        .clang_arg(format!("-I{}", sdk.display()))
        // the types and the function table; the two entry points we write ourselves
        .allowlist_type("addon_.*")
        .blocklist_function(".*")
        .rustified_enum("addon_status")
        .rustified_enum("addon_valuetype")
        .layout_tests(true)
        .generate()
        .expect("bindgen failed on the UXP Hybrid SDK headers");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("sdk.rs");
    bindings.write_to_file(out).unwrap();
}
