use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

// ★ JanCode 使用独立状态目录，与上游 Codex++ 的 ~/.codex-session-delete 互不干扰
const APP_STATE_DIR: &str = ".jancode";
const SETTINGS_FILE: &str = "settings.json";
const LATEST_STATUS_FILE: &str = "latest-status.json";
const DIAGNOSTIC_LOG_FILE: &str = "jancode.log";
const PENDING_PROVIDER_IMPORT_FILE: &str = "pending-provider-import.json";
const PENDING_SESSION_SHARE_FILE: &str = "pending-session-share.txt";
const PENDING_REMOTE_CONTROL_RECOVERY_FILE: &str = "pending-remote-control-recovery.json";
const SKILLS_STATE_FILE: &str = "skills.json";
const SKILLS_DIR: &str = "skills";
const SKILL_BACKUPS_DIR: &str = "skill-backups";
const PENDING_MANAGER_NAVIGATION_FILE: &str = "pending-manager-navigation.json";

/// 环境变量：把整个状态目录搬到别处。
/// 两个用途——测试隔离（集成测试跑的是真实代码路径，不隔离就会把诊断日志
/// 写进用户真实目录），以及让用户自行迁移数据目录。
pub const APP_STATE_DIR_ENV: &str = "JANCODE_STATE_DIR";

/// 当前进程是不是 cargo 跑起来的测试二进制。
///
/// 判据是路径：cargo test 生成的二进制位于 `target/<profile>/deps/<名字>-<哈希>`，
/// 而真实安装不会落在 deps/ 下（macOS 在 .app 包内，Windows 在 Programs，
/// Linux 在 /usr/local/bin）。
///
/// 为什么自动判断而不是让每个测试自己声明：core 的集成测试有 771 个。
/// 要求每个测试自己隔离，结果就是「写了的人隔离了，没写的人污染，
/// 新加的测试默认是污染的」——这个坑已经踩过一次。
fn running_under_cargo_test() -> bool {
    static CACHED: OnceLock<bool> = OnceLock::new();
    *CACHED.get_or_init(|| {
        std::env::current_exe()
            .ok()
            .map(|p| {
                let s = p.to_string_lossy();
                s.contains("/deps/") || s.contains("\\deps\\")
            })
            .unwrap_or(false)
    })
}

/// 测试期间的临时状态目录。每个进程一个并保持一致——
/// 每次调用都新建的话，不同代码路径会拿到不同路径，反而更乱。
fn test_state_dir() -> PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let base = std::env::temp_dir().join(format!("jancode-test-state-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&base);
        base
    })
    .clone()
}

/// 不含任何测试隔离的「原始默认值」。
///
/// 存在的理由：断言「默认目录就是 ~/.jancode」的测试需要看到真实默认值，
/// 而 default_app_state_dir() 在测试进程里会返回临时目录。
/// 把「默认值是什么」和「这次实际用哪个」分开，两个契约才能各自被测到。
pub fn raw_default_app_state_dir() -> PathBuf {
    if let Some(home_dir) = directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf()) {
        return home_dir.join(APP_STATE_DIR);
    }
    PathBuf::from(APP_STATE_DIR)
}

pub fn default_app_state_dir() -> PathBuf {
    // 优先级：进程内测试覆盖 > 环境变量 > 家目录默认值。
    //
    // 之所以在「目录」这一层做覆盖、而不是给每个文件单独开：日志、skills、
    // pending-* 全都是从状态目录派生的，逐个补必然漏。
    if let Some(dir) = app_state_dir_for_tests() {
        return dir;
    }

    if let Some(dir) = std::env::var_os(APP_STATE_DIR_ENV) {
        if !dir.is_empty() {
            return PathBuf::from(dir);
        }
    }

    if running_under_cargo_test() {
        let dir = test_state_dir();
        // 同时写进环境变量，让测试启动的子进程也继承同一个目录。
        // 光返回临时目录不够：测试会启动真实的 manager 子进程去验证启动链路，
        // 那个子进程不是测试二进制、检测不到，照样往用户真实目录写日志。
        // （实测残留 201 字节，事件是 manager.start / manager.already_running。）
        unsafe {
            std::env::set_var(APP_STATE_DIR_ENV, &dir);
        }
        return dir;
    }

    raw_default_app_state_dir()
}

pub fn default_settings_path() -> PathBuf {
    if let Some(path) = settings_path_for_tests() {
        return path;
    }
    default_app_state_dir().join(SETTINGS_FILE)
}

pub fn default_latest_status_path() -> PathBuf {
    default_app_state_dir().join(LATEST_STATUS_FILE)
}

pub fn default_diagnostic_log_path() -> PathBuf {
    default_app_state_dir().join(DIAGNOSTIC_LOG_FILE)
}

pub fn default_pending_provider_import_path() -> PathBuf {
    default_app_state_dir().join(PENDING_PROVIDER_IMPORT_FILE)
}

pub fn default_pending_session_share_path() -> PathBuf {
    default_app_state_dir().join(PENDING_SESSION_SHARE_FILE)
}

pub fn default_pending_remote_control_recovery_path() -> PathBuf {
    default_app_state_dir().join(PENDING_REMOTE_CONTROL_RECOVERY_FILE)
}

/// Skills 的「单一事实来源」目录。已安装的 skill 目录都放这里，
/// 启用时再软链到 `$CODEX_HOME/skills/<id>`，停用只删链接、源目录留着。
pub fn default_skills_source_dir() -> PathBuf {
    default_app_state_dir().join(SKILLS_DIR)
}

pub fn default_skills_state_path() -> PathBuf {
    default_app_state_dir().join(SKILLS_STATE_FILE)
}

/// 卸载 skill 时把源目录整体移到这里，方便反悔。不自动轮转删除。
pub fn default_skill_backups_dir() -> PathBuf {
    default_app_state_dir().join(SKILL_BACKUPS_DIR)
}

pub fn default_pending_manager_navigation_path() -> PathBuf {
    default_app_state_dir().join(PENDING_MANAGER_NAVIGATION_FILE)
}

fn settings_path_for_tests() -> Option<PathBuf> {
    SETTINGS_PATH_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|path| path.clone())
}

static SETTINGS_PATH_FOR_TESTS: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn app_state_dir_for_tests() -> Option<PathBuf> {
    APP_STATE_DIR_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|path| path.clone())
}

static APP_STATE_DIR_FOR_TESTS: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

/// 把整个状态目录重定向到临时目录，返回此前的值以便还原。
/// 测试里应当用它，而不是让日志、skills 等写进用户真实的 ~/.jancode。
pub fn set_app_state_dir_for_tests(path: Option<PathBuf>) -> Option<PathBuf> {
    APP_STATE_DIR_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|mut current| std::mem::replace(&mut *current, path))
}

#[cfg(test)]
static SETTINGS_PATH_TEST_GUARD: OnceLock<Mutex<()>> = OnceLock::new();

#[cfg(test)]
pub(crate) fn settings_path_test_guard() -> std::sync::MutexGuard<'static, ()> {
    SETTINGS_PATH_TEST_GUARD
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap()
}

pub fn set_settings_path_for_tests(path: Option<PathBuf>) -> Option<PathBuf> {
    SETTINGS_PATH_FOR_TESTS
        .get_or_init(|| Mutex::new(None))
        .lock()
        .ok()
        .and_then(|mut current| std::mem::replace(&mut *current, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_state_dir_can_be_redirected_for_tests() {
        // 测试不该写进用户真实目录。这里验证重定向真的生效，
        // 而且是从状态目录这一层生效——日志、skills 等派生路径一并被带走。
        //
        // 必须拿 guard：状态目录是全局状态，并行测试之间会互相污染。
        // 第一次写这条测试时没拿，结果是另一个依赖状态目录的测试随机失败。
        let _guard = settings_path_test_guard();
        let previous = set_app_state_dir_for_tests(Some(PathBuf::from("/tmp/jancode-test-state")));

        assert_eq!(
            default_app_state_dir(),
            PathBuf::from("/tmp/jancode-test-state")
        );
        // 关键：派生路径也要跟着走
        assert!(default_diagnostic_log_path().starts_with("/tmp/jancode-test-state"));
        assert!(default_skills_source_dir().starts_with("/tmp/jancode-test-state"));
        assert!(default_pending_provider_import_path().starts_with("/tmp/jancode-test-state"));
        // 真实目录的影子不该出现在任何派生出���路径里
        for path in [
            default_app_state_dir(),
            default_diagnostic_log_path(),
            default_skills_source_dir(),
        ] {
            assert!(
                !path.to_string_lossy().contains("/.jancode"),
                "重定向后不该再指向真实状态目录：{}",
                path.display()
            );
        }

        set_app_state_dir_for_tests(previous);
    }

    #[test]
    fn raw_default_app_state_dir_is_jancode_under_home() {
        // 「默认目录是 ~/.jancode」这个契约本身仍需被验证。
        // 用 raw_ 版本测，因为 default_app_state_dir() 在测试进程里会返回临时目录。
        let raw = raw_default_app_state_dir();
        assert!(
            raw.ends_with(".jancode"),
            "原始默认值应当是 ~/.jancode，实际是 {}",
            raw.display()
        );
    }

    #[test]
    fn test_process_isolates_state_dir_from_user_home() {
        // 反过来守住隔离本身：在 cargo test 进程里，生效路径不该是用户真实目录。
        // 这条测试的价值在于——如果哪天隔离失效了，它会失败，
        // 而不是让测试悄悄往用户目录里写日志。
        let effective = default_app_state_dir();
        assert!(
            !effective.ends_with(".jancode") || effective.starts_with(std::env::temp_dir()),
            "测试进程不该写到用户真实状态目录，实际是 {}",
            effective.display()
        );
    }

    #[test]
    fn default_settings_path_uses_app_state_directory() {
        // 必须持锁：settings 路径有独立的全局测试覆盖，并行测试会互相干扰。
        let _guard = settings_path_test_guard();
        // 断言派生关系而不是硬编码路径：不管有没有测试隔离都成立，
        // 而且这才是真正的契约——「日志路径 = 状态目录 + 文件名」。
        // 之前写成 ends_with(".jancode/...")，把「默认位置」和「派生规则」
        // 混在一句话里，加了隔离之后就挂。
        assert_eq!(
            default_settings_path(),
            default_app_state_dir().join("settings.json")
        );
    }

    #[test]
    fn default_latest_status_path_uses_app_state_directory() {
        // 断言派生关系而不是硬编码路径：不管有没有测试隔离都成立，
        // 而且这才是真正的契约——「日志路径 = 状态目录 + 文件名」。
        // 之前写成 ends_with(".jancode/...")，把「默认位置」和「派生规则」
        // 混在一句话里，加了隔离之后就挂。
        assert_eq!(
            default_latest_status_path(),
            default_app_state_dir().join("latest-status.json")
        );
    }

    #[test]
    fn default_diagnostic_log_path_uses_app_state_directory() {
        // 断言派生关系而不是硬编码路径：不管有没有测试隔离都成立，
        // 而且这才是真正的契约——「日志路径 = 状态目录 + 文件名」。
        // 之前写成 ends_with(".jancode/...")，把「默认位置」和「派生规则」
        // 混在一句话里，加了隔离之后就挂。
        assert_eq!(
            default_diagnostic_log_path(),
            default_app_state_dir().join("jancode.log")
        );
    }

    #[test]
    fn default_pending_provider_import_path_uses_app_state_directory() {
        // 断言派生关系而不是硬编码路径：不管有没有测试隔离都成立，
        // 而且这才是真正的契约——「日志路径 = 状态目录 + 文件名」。
        // 之前写成 ends_with(".jancode/...")，把「默认位置」和「派生规则」
        // 混在一句话里，加了隔离之后就挂。
        assert_eq!(
            default_pending_provider_import_path(),
            default_app_state_dir().join("pending-provider-import.json")
        );
    }

    #[test]
    fn default_pending_session_share_path_uses_app_state_directory() {
        // 断言派生关系而不是硬编码路径：不管有没有测试隔离都成立，
        // 而且这才是真正的契约——「日志路径 = 状态目录 + 文件名」。
        // 之前写成 ends_with(".jancode/...")，把「默认位置」和「派生规则」
        // 混在一句话里，加了隔离之后就挂。
        assert_eq!(
            default_pending_session_share_path(),
            default_app_state_dir().join("pending-session-share.txt")
        );
    }

    #[test]
    fn default_pending_remote_control_recovery_path_uses_app_state_directory() {
        // 断言派生关系而不是硬编码路径：不管有没有测试隔离都成立，
        // 而且这才是真正的契约——「日志路径 = 状态目录 + 文件名」。
        // 之前写成 ends_with(".jancode/...")，把「默认位置」和「派生规则」
        // 混在一句话里，加了隔离之后就挂。
        assert_eq!(
            default_pending_remote_control_recovery_path(),
            default_app_state_dir().join("pending-remote-control-recovery.json")
        );
    }

    #[test]
    fn default_pending_manager_navigation_path_uses_app_state_directory() {
        // 断言派生关系而不是硬编码路径：不管有没有测试隔离都成立，
        // 而且这才是真正的契约——「日志路径 = 状态目录 + 文件名」。
        // 之前写成 ends_with(".jancode/...")，把「默认位置」和「派生规则」
        // 混在一句话里，加了隔离之后就挂。
        assert_eq!(
            default_pending_manager_navigation_path(),
            default_app_state_dir().join("pending-manager-navigation.json")
        );
    }
}
