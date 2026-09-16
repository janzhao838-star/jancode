//! 集成测试的公共辅助。
//!
//! 存在的理由：集成测试跑的是真实代码路径，这些路径会往状态目录写诊断日志。
//! 不隔离的话，测试记录会混进用户真实的 ~/.jancode/jancode.log，
//! 让排查的人把测试数据当成真实使用记录——已经发生过一次。
//!
//! 用法：测试文件开头写 `mod common;`，然后在每个 #[test] 里调
//! `common::isolate_state_dir()`；或者用 `#[test] fn x() { let _g = ...; }`。

#![allow(dead_code)]

use std::path::PathBuf;

/// 把状态目录重定向到一个独立的临时目录，避免写进用户真实目录。
///
/// 返回临时目录句柄，**必须绑定到变量并持有到测试结束**，否则目录会被提前删除。
pub fn isolate_state_dir() -> tempfile::TempDir {
    let dir = tempfile::Builder::new()
        .prefix("jancode-test-state-")
        .tempdir()
        .expect("创建临时状态目录失败");

    // SAFETY: set_var 在多线程下不安全。测试二进制里各处都会调这个函数，
    // 但写入的是同一个值语义（各自独立的临时目录），且都发生在测试开始、
    // 业务线程尚未启动之前。这是集成测试隔离的通行做法。
    unsafe {
        std::env::set_var("JANCODE_STATE_DIR", dir.path());
    }
    dir
}

/// 只取路径、不持有句柄的版本。如果调用方自己管理生命周期，用这个。
pub fn isolated_state_path() -> PathBuf {
    let dir = tempfile::Builder::new()
        .prefix("jancode-test-state-")
        .tempdir()
        .expect("创建临时状态目录失败");
    dir.keep()
}
