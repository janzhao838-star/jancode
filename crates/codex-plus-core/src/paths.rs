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

    if let Some(home_dir) = directories::BaseDirs::new().map(|dirs| dirs.home_dir().to_path_buf()) {
        return home_dir.join(APP_STATE_DIR);
    }

    PathBuf::from(APP_STATE_DIR)
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
    fn default_settings_path_uses_app_state_directory() {
        let _guard = settings_path_test_guard();
        let path = default_settings_path();

        assert!(path.ends_with(".jancode/settings.json"));
    }

    #[test]
    fn default_latest_status_path_uses_app_state_directory() {
        let path = default_latest_status_path();

        assert!(path.ends_with(".jancode/latest-status.json"));
    }

    #[test]
    fn default_diagnostic_log_path_uses_app_state_directory() {
        let path = default_diagnostic_log_path();

        assert!(path.ends_with(".jancode/jancode.log"));
    }

    #[test]
    fn default_pending_provider_import_path_uses_app_state_directory() {
        let path = default_pending_provider_import_path();

        assert!(path.ends_with(".jancode/pending-provider-import.json"));
    }

    #[test]
    fn default_pending_session_share_path_uses_app_state_directory() {
        let path = default_pending_session_share_path();

        assert!(path.ends_with(".jancode/pending-session-share.txt"));
    }

    #[test]
    fn default_pending_remote_control_recovery_path_uses_app_state_directory() {
        let path = default_pending_remote_control_recovery_path();

        assert!(path.ends_with(".jancode/pending-remote-control-recovery.json"));
    }

    #[test]
    fn default_pending_manager_navigation_path_uses_app_state_directory() {
        let path = default_pending_manager_navigation_path();

        assert!(path.ends_with(".jancode/pending-manager-navigation.json"));
    }
}
