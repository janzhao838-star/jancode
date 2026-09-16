use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

pub mod macos;
pub mod windows;

// ─────────────────────────────────────────────────────────────
//  JanCode 品牌常量（基于上游 CodexPlusPlus AGPL-3.0 定制重命名）
//  改这里即可整体切换应用名、可执行名与 macOS Bundle ID。
// ─────────────────────────────────────────────────────────────
pub const SILENT_NAME: &str = "JanCode";
pub const MANAGER_NAME: &str = "JanCode 管理工具";
pub const SILENT_BINARY: &str = "jancode";
pub const MACOS_SILENT_EXECUTABLE: &str = "JanCode";
pub const MANAGER_BINARY: &str = "jancode-manager";
pub const MACOS_MANAGER_EXECUTABLE: &str = "JanCodeManager";
pub const SILENT_BUNDLE_ID: &str = "com.janzhao.jancode";
pub const MANAGER_BUNDLE_ID: &str = "com.janzhao.jancode.manager";
/// 内部图标资源名（随应用一起安装到 Resources）
pub const ICON_FILE_NAME: &str = "jancode.png";
/// 自定义 URL 协议。★ 刻意保持与上游一致：这两个 scheme 是与 Codex++ 社区
/// （会话分享站点、DreamSkin 皮肤市场）互操作的标识，不是用户可见品牌。
/// 改成 jancode:// 会让社区分享链接和皮肤市场链接全部失效。
pub const URL_SCHEME_MAIN: &str = "codexplusplus";
pub const URL_SCHEME_SKIN: &str = "dreamskin";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstallOptions {
    #[serde(default)]
    pub install_root: Option<PathBuf>,
    #[serde(default)]
    pub launcher_path: Option<PathBuf>,
    #[serde(default)]
    pub manager_path: Option<PathBuf>,
    #[serde(default)]
    pub remove_owned_data: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ShortcutState {
    pub installed: bool,
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EntryPointState {
    pub silent_shortcut: ShortcutState,
    pub management_shortcut: ShortcutState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InstallActionResult {
    pub status: String,
    pub message: String,
    pub silent_shortcut: ShortcutState,
    pub management_shortcut: ShortcutState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MacosAppBundle {
    pub app_path: PathBuf,
    pub info_plist: String,
    pub launch_script: String,
    pub binary_source: Option<PathBuf>,
    pub binary_target_name: Option<String>,
}

impl ShortcutState {
    pub fn missing(path: Option<PathBuf>) -> Self {
        Self {
            installed: false,
            path: path.map(|path| path.to_string_lossy().to_string()),
        }
    }

    pub fn from_candidates(candidates: Vec<PathBuf>) -> Self {
        if let Some(path) = candidates.iter().find(|path| path.exists()) {
            return Self {
                installed: true,
                path: Some(path.to_string_lossy().to_string()),
            };
        }
        Self::missing(candidates.into_iter().next())
    }
}

pub fn shortcut_names() -> (&'static str, &'static str) {
    ("JanCode.lnk", "JanCode 管理工具.lnk")
}

pub fn app_bundle_names() -> (&'static str, &'static str) {
    ("JanCode.app", "JanCode 管理工具.app")
}

pub fn inspect_entrypoints() -> EntryPointState {
    let root = default_install_root();
    EntryPointState {
        silent_shortcut: ShortcutState::from_candidates(entrypoint_candidates(&root, false)),
        management_shortcut: ShortcutState::from_candidates(entrypoint_candidates(&root, true)),
    }
}

pub fn install_entrypoints(options: &InstallOptions) -> InstallActionResult {
    let result = platform_install(options);
    action_result(result, "入口已安装。")
}

pub fn uninstall_entrypoints(options: &InstallOptions) -> InstallActionResult {
    let result = platform_uninstall(options);
    if result.is_ok() && options.remove_owned_data {
        let _ = remove_owned_data();
    }
    action_result(result, "入口已卸载。")
}

pub fn repair_entrypoints(options: &InstallOptions) -> InstallActionResult {
    let result = platform_install(options);
    action_result(result, "入口已修复。")
}

pub fn build_windows_entrypoint_plan(options: &InstallOptions) -> windows::WindowsEntrypointPlan {
    windows::build_windows_entrypoint_plan(options)
}

pub fn build_macos_app_bundle(options: &InstallOptions, manager: bool) -> MacosAppBundle {
    macos::build_app_bundle(options, manager)
}

pub fn remove_owned_data() -> std::io::Result<()> {
    let dir = crate::paths::default_app_state_dir();
    if !dir.exists() {
        return Ok(());
    }
    // 卸载流程会递归删除，路径来自环境/推导，先过一道"不许删 CODEX_HOME 及其祖先"
    // 的兜底（#2146）。守卫只在这条路径确实指向 home 时才会拒绝，正常卸载不受影响。
    if let Err(error) = crate::codex_home::ensure_safe_recursive_removal(
        &dir,
        &crate::codex_home::default_codex_home_dir(),
    ) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            error.to_string(),
        ));
    }
    std::fs::remove_dir_all(dir)?;
    Ok(())
}

pub fn default_install_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        return crate::windows_integration::desktop_dir().or_else(|| {
            directories::UserDirs::new().and_then(|dirs| dirs.desktop_dir().map(PathBuf::from))
        });
    }

    #[cfg(target_os = "macos")]
    {
        let sys_apps = PathBuf::from("/Applications");
        if sys_apps.join(format!("{SILENT_NAME}.app")).exists()
            || sys_apps.join(format!("{MANAGER_NAME}.app")).exists()
        {
            return Some(sys_apps);
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = macos_applications_dir_from_exe(&exe) {
                if is_macos_applications_dir(&dir) {
                    return Some(dir);
                }
            }
        }
        return Some(sys_apps);
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        directories::UserDirs::new().and_then(|dirs| dirs.desktop_dir().map(PathBuf::from))
    }
}

pub fn default_install_root_strategy() -> &'static str {
    if cfg!(windows) {
        "windows-known-folder"
    } else if cfg!(target_os = "macos") {
        "macos-applications"
    } else {
        "user-dirs-desktop"
    }
}

fn platform_install(options: &InstallOptions) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        windows::install_shortcuts(options)
    }

    #[cfg(target_os = "macos")]
    {
        macos::install_app_bundles(options)
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = options;
        anyhow::bail!("当前平台暂不支持安装 JanCode 入口")
    }
}

fn platform_uninstall(options: &InstallOptions) -> anyhow::Result<()> {
    #[cfg(windows)]
    {
        windows::uninstall_shortcuts(options)
    }

    #[cfg(target_os = "macos")]
    {
        macos::uninstall_app_bundles(options)
    }

    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = options;
        anyhow::bail!("当前平台暂不支持卸载 JanCode 入口")
    }
}

fn action_result(result: anyhow::Result<()>, success_message: &str) -> InstallActionResult {
    let state = inspect_entrypoints();
    match result {
        Ok(()) => InstallActionResult {
            status: "ok".to_string(),
            message: success_message.to_string(),
            silent_shortcut: state.silent_shortcut,
            management_shortcut: state.management_shortcut,
        },
        Err(error) => InstallActionResult {
            status: "failed".to_string(),
            message: error.to_string(),
            silent_shortcut: state.silent_shortcut,
            management_shortcut: state.management_shortcut,
        },
    }
}

fn entrypoint_candidates(root: &Option<PathBuf>, manager: bool) -> Vec<PathBuf> {
    let Some(root) = root else {
        return Vec::new();
    };
    let name = if manager { MANAGER_NAME } else { SILENT_NAME };
    if cfg!(windows) {
        vec![root.join(format!("{name}.lnk"))]
    } else if cfg!(target_os = "macos") {
        vec![root.join(format!("{name}.app"))]
    } else {
        vec![root.join(format!("{name}.desktop"))]
    }
}

pub fn option_or_current_exe(value: &Option<PathBuf>, binary: &str) -> PathBuf {
    if let Some(value) = value {
        return value.clone();
    }
    let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    companion_binary_path_from_exe(&exe, binary)
}

pub fn companion_binary_path(binary: &str) -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    companion_binary_path_from_exe(&exe, binary)
}

pub fn spawn_companion<I, S>(binary: &str, args: I) -> anyhow::Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let args = args
        .into_iter()
        .map(|arg| arg.as_ref().to_os_string())
        .collect::<Vec<OsString>>();

    // 测试进程里不真的启动。
    //
    // 起因：桥接路由 open_transient_manager 会调这个函数启动真实 manager，
    // 而测试会打到那个路由。结果每跑一次 cargo test 就留下一个孤儿
    // jancode-manager 进程，它占着单实例锁（回环端口），之后启动**安装版**
    // 只会记一条 manager.already_running——窗口不出现、无任何提示，
    // 表现为「双击没反应」。
    //
    // 实测：跑测试前 0 个 jancode 进程，跑完后 1 个。
    //
    // 自动跳过而不是让测试自己声明：要求每个测试记得声明，实际结果就是
    // 「写了的隔离了，没写的污染，新加的默认是污染的」。
    if crate::paths::running_under_cargo_test() {
        let path = companion_binary_path(binary);
        let _ = crate::diagnostic_log::append_diagnostic_log(
            "companion.spawn_skipped_in_test",
            serde_json::json!({
                "binary": binary,
                "args": args.iter().map(|a| a.to_string_lossy().to_string()).collect::<Vec<_>>(),
                "would_spawn": path.to_string_lossy(),
            }),
        );
        return Ok(path.to_string_lossy().to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
        if let Some(bundle_id) = macos_companion_bundle_identifier_from_exe(&exe, binary) {
            let launch_result = Command::new("/usr/bin/open")
                .args(["-n", "-b", bundle_id, "--args"])
                .args(&args)
                .status();
            if launch_result.as_ref().is_ok_and(|status| status.success()) {
                return Ok(format!("bundle:{bundle_id}"));
            }
            let fallback = companion_binary_path_from_exe(&exe, binary);
            if !fallback.exists() {
                let detail = launch_result
                    .map(|status| status.to_string())
                    .unwrap_or_else(|error| error.to_string());
                anyhow::bail!("macOS Launch Services 无法启动 bundle {bundle_id}：{detail}");
            }
        }
    }

    let path = companion_binary_path(binary);
    let mut command = Command::new(&path);
    command.args(&args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(crate::windows_create_no_window());
    }
    command
        .spawn()
        .map_err(|error| anyhow::anyhow!("无法启动 {}：{error}", path.to_string_lossy()))?;
    Ok(path.to_string_lossy().to_string())
}

pub fn open_or_activate_manager() -> anyhow::Result<String> {
    #[cfg(target_os = "macos")]
    {
        let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
        if let Some(bundle_id) = macos_companion_bundle_identifier_from_exe(&exe, MANAGER_BINARY) {
            let activated = Command::new("/usr/bin/open")
                .args(["-b", bundle_id])
                .status()
                .is_ok_and(|status| status.success());
            if activated {
                return Ok(format!("bundle:{bundle_id}"));
            }
        }
    }

    spawn_companion(MANAGER_BINARY, std::iter::empty::<&str>())
}

pub fn macos_companion_bundle_identifier_from_exe(
    exe: &Path,
    binary: &str,
) -> Option<&'static str> {
    let (_, app_name) = macos_applications_dir_and_app_name_from_exe(exe)?;
    let known_bundle =
        app_name == format!("{SILENT_NAME}.app") || app_name == format!("{MANAGER_NAME}.app");
    if !known_bundle {
        return None;
    }
    match binary {
        SILENT_BINARY => Some(SILENT_BUNDLE_ID),
        MANAGER_BINARY => Some(MANAGER_BUNDLE_ID),
        _ => None,
    }
}

pub fn companion_binary_path_from_exe(exe: &Path, binary: &str) -> PathBuf {
    let dir = exe.parent().unwrap_or_else(|| Path::new("."));
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    if let Some(bundle_binary) = macos_companion_binary_from_exe(exe, binary) {
        // A local Tauri bundle contains the manager only. Prefer the freshly
        // built launcher beside `target/release` when the sibling app is not
        // present, while keeping the installed /Applications layout intact.
        if bundle_binary.exists() || !is_macos_development_bundle(exe) {
            return bundle_binary;
        }
    }
    #[cfg(target_os = "macos")]
    if let Some(development_binary) = macos_development_companion_binary(exe, binary) {
        return development_binary;
    }
    let same_bundle = dir.join(binary);
    if same_bundle.exists() {
        return same_bundle;
    }
    dir.join(format!("{binary}{suffix}"))
}

fn is_macos_development_bundle(exe: &Path) -> bool {
    exe.components()
        .any(|component| component.as_os_str() == "target")
        && exe
            .components()
            .any(|component| component.as_os_str() == "bundle")
}

#[cfg(target_os = "macos")]
fn macos_development_companion_binary(exe: &Path, binary: &str) -> Option<PathBuf> {
    let mut path = exe.parent()?;
    while let Some(parent) = path.parent() {
        if matches!(
            path.file_name().and_then(|name| name.to_str()),
            Some("release" | "debug")
        ) {
            let candidate = path.join(binary);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
        path = parent;
    }
    None
}

fn macos_companion_binary_from_exe(exe: &Path, binary: &str) -> Option<PathBuf> {
    let (applications_dir, app_name) = macos_applications_dir_and_app_name_from_exe(exe)?;
    if binary == SILENT_BINARY {
        if app_name == format!("{SILENT_NAME}.app") {
            return Some(macos_preferred_bundle_binary(
                exe,
                SILENT_BINARY,
                MACOS_SILENT_EXECUTABLE,
            ));
        }
        let macos = applications_dir
            .join(format!("{SILENT_NAME}.app"))
            .join("Contents")
            .join("MacOS");
        return Some(
            macos
                .join(SILENT_BINARY)
                .exists()
                .then(|| macos.join(SILENT_BINARY))
                .unwrap_or_else(|| macos.join(MACOS_SILENT_EXECUTABLE)),
        );
    }
    if binary == MANAGER_BINARY {
        if app_name == format!("{MANAGER_NAME}.app") {
            return Some(macos_preferred_bundle_binary(
                exe,
                MANAGER_BINARY,
                MACOS_MANAGER_EXECUTABLE,
            ));
        }
        let macos = applications_dir
            .join(format!("{MANAGER_NAME}.app"))
            .join("Contents")
            .join("MacOS");
        return Some(
            macos
                .join(MANAGER_BINARY)
                .exists()
                .then(|| macos.join(MANAGER_BINARY))
                .unwrap_or_else(|| macos.join(MACOS_MANAGER_EXECUTABLE)),
        );
    }
    None
}

fn macos_preferred_bundle_binary(
    exe: &Path,
    sidecar_name: &str,
    bundle_executable_name: &str,
) -> PathBuf {
    let macos = exe.parent().unwrap_or_else(|| Path::new("."));
    let sidecar = macos.join(sidecar_name);
    if sidecar.exists() {
        return sidecar;
    }
    let bundle_executable = macos.join(bundle_executable_name);
    if bundle_executable.exists() {
        return bundle_executable;
    }
    exe.to_path_buf()
}

#[cfg(target_os = "macos")]
fn macos_applications_dir_from_exe(exe: &Path) -> Option<PathBuf> {
    macos_applications_dir_and_app_name_from_exe(exe).map(|(dir, _)| dir)
}

fn macos_applications_dir_and_app_name_from_exe(exe: &Path) -> Option<(PathBuf, String)> {
    let mut path = exe;
    while let Some(parent) = path.parent() {
        if path.extension().and_then(|extension| extension.to_str()) == Some("app") {
            let app_name = path.file_name()?.to_string_lossy().to_string();
            return Some((parent.to_path_buf(), app_name));
        }
        path = parent;
    }
    None
}

#[cfg(target_os = "macos")]
fn is_macos_applications_dir(path: &Path) -> bool {
    if path == Path::new("/Applications") {
        return true;
    }
    directories::BaseDirs::new()
        .map(|dirs| path == dirs.home_dir().join("Applications"))
        .unwrap_or(false)
}

pub(crate) fn install_root_or_default(options: &InstallOptions) -> PathBuf {
    options
        .install_root
        .clone()
        .or_else(default_install_root)
        .unwrap_or_else(|| PathBuf::from("."))
}
