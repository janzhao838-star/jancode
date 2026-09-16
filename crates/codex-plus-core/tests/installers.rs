use codex_plus_core::install::{
    InstallOptions, MANAGER_BUNDLE_ID, SILENT_BINARY, SILENT_BUNDLE_ID, app_bundle_names,
    build_macos_app_bundle, build_windows_entrypoint_plan, companion_binary_path_from_exe,
    default_install_root_strategy, macos_companion_bundle_identifier_from_exe, shortcut_names,
};

#[test]
fn windows_entrypoint_plan_contains_silent_and_manager_entrypoints() {
    let options = InstallOptions {
        install_root: Some("C:/Users/A/Desktop".into()),
        launcher_path: Some("C:/Tools/jancode.exe".into()),
        manager_path: Some("C:/Tools/jancode-manager.exe".into()),
        remove_owned_data: false,
    };

    let plan = build_windows_entrypoint_plan(&options);

    assert!(plan.silent_shortcut.ends_with("JanCode.lnk"));
    assert!(plan.manager_shortcut.ends_with("JanCode 管理工具.lnk"));
    assert_eq!(plan.launcher_path, "C:/Tools/jancode.exe");
    assert_eq!(plan.manager_path, "C:/Tools/jancode-manager.exe");
    assert_eq!(plan.silent_icon_path, "C:/Tools/jancode.exe");
    assert_eq!(
        plan.manager_icon_path,
        "C:/Tools/jancode-manager.exe"
    );
    assert_eq!(plan.uninstall_key, "JanCode");
    // JanCode 刻意使用独立的 legacy 键，避免卸载时误删上游 Codex++ 的注册表登记
    assert_eq!(plan.legacy_uninstall_key, "JanCodeLegacy");
    assert_eq!(
        plan.uninstaller_path.replace('\\', "/"),
        "C:/Tools/uninstall.exe"
    );
    assert_eq!(
        plan.uninstall_command.replace('\\', "/"),
        "\"C:/Tools/uninstall.exe\""
    );
    assert_eq!(
        plan.quiet_uninstall_command.replace('\\', "/"),
        "\"C:/Tools/uninstall.exe\" /S"
    );
    assert_ne!(
        plan.uninstall_command,
        "\"C:/Tools/jancode-manager.exe\""
    );
}

#[test]
fn windows_entrypoint_plan_can_request_owned_data_removal_without_shell_script() {
    let options = InstallOptions {
        install_root: Some("C:/Users/A/Desktop".into()),
        launcher_path: None,
        manager_path: None,
        remove_owned_data: true,
    };

    let plan = build_windows_entrypoint_plan(&options);

    assert!(plan.silent_shortcut.ends_with("JanCode.lnk"));
    assert!(plan.manager_shortcut.ends_with("JanCode 管理工具.lnk"));
    assert!(plan.remove_owned_data);
}

#[test]
fn macos_bundle_metadata_contains_silent_and_manager_apps() {
    let options = InstallOptions {
        install_root: Some("/Applications".into()),
        launcher_path: Some("/opt/JanCode/jancode".into()),
        manager_path: Some("/opt/JanCode/jancode-manager".into()),
        remove_owned_data: false,
    };

    let silent = build_macos_app_bundle(&options, false);
    let manager = build_macos_app_bundle(&options, true);

    assert!(silent.app_path.ends_with("JanCode.app"));
    assert!(manager.app_path.ends_with("JanCode 管理工具.app"));
    assert!(silent.info_plist.contains("<string>JanCode</string>"));
    assert!(
        manager
            .info_plist
            .contains("<string>JanCode 管理工具</string>")
    );
    assert!(manager.info_plist.contains("<string>dreamskin</string>"));
    assert!(manager.info_plist.contains("<string>codexplusplus</string>"));
    assert!(!silent.info_plist.contains("<string>dreamskin</string>"));
    assert_eq!(
        silent.binary_target_name.as_deref(),
        Some("jancode")
    );
    assert_eq!(
        manager.binary_target_name.as_deref(),
        Some("jancode-manager")
    );
    assert!(silent.launch_script.contains("$DIR/jancode"));
    assert!(
        manager
            .launch_script
            .contains("$DIR/jancode-manager")
    );
}

#[test]
fn installer_exports_expected_two_entrypoint_names() {
    assert_eq!(shortcut_names(), ("JanCode.lnk", "JanCode 管理工具.lnk"));
    assert_eq!(app_bundle_names(), ("JanCode.app", "JanCode 管理工具.app"));
}

#[test]
fn macos_dmg_includes_applications_shortcut_for_drag_install() {
    let script = std::fs::read_to_string("../../scripts/installer/macos/package-dmg.sh")
        .expect("read macOS DMG packaging script");

    assert!(script.contains("ln -s /Applications \"$STAGE/Applications\""));
}

#[test]
fn companion_binary_path_resolves_macos_silent_app_next_to_manager_app() {
    let manager_exe = std::path::Path::new(
        "/Applications/JanCode 管理工具.app/Contents/MacOS/JanCodeManager",
    );

    let companion = companion_binary_path_from_exe(manager_exe, SILENT_BINARY);

    assert_eq!(
        companion,
        std::path::PathBuf::from("/Applications/JanCode.app/Contents/MacOS/JanCode")
    );
    assert_ne!(
        companion,
        std::path::PathBuf::from(
            "/Applications/JanCode 管理工具.app/Contents/MacOS/jancode"
        )
    );
}

#[test]
fn companion_binary_path_resolves_macos_manager_app_next_to_silent_app() {
    let silent_exe = std::path::Path::new("/Applications/JanCode.app/Contents/MacOS/JanCode");

    let companion =
        companion_binary_path_from_exe(silent_exe, codex_plus_core::install::MANAGER_BINARY);

    assert_eq!(
        companion,
        std::path::PathBuf::from(
            "/Applications/JanCode 管理工具.app/Contents/MacOS/JanCodeManager"
        )
    );
}

#[test]
fn macos_companion_launch_uses_bundle_ids_from_app_translocation() {
    let manager_exe = std::path::Path::new(
        "/private/var/folders/x/AppTranslocation/manager-id/d/JanCode 管理工具.app/Contents/MacOS/JanCodeManager",
    );
    let silent_exe = std::path::Path::new(
        "/private/var/folders/x/AppTranslocation/silent-id/d/JanCode.app/Contents/MacOS/JanCode",
    );

    assert_eq!(
        macos_companion_bundle_identifier_from_exe(manager_exe, SILENT_BINARY),
        Some(SILENT_BUNDLE_ID)
    );
    assert_eq!(
        macos_companion_bundle_identifier_from_exe(
            silent_exe,
            codex_plus_core::install::MANAGER_BINARY,
        ),
        Some(MANAGER_BUNDLE_ID)
    );
}

#[test]
fn macos_companion_launch_keeps_bare_binary_development_mode() {
    let manager_exe = std::path::Path::new("/tmp/target/debug/jancode-manager");

    assert_eq!(
        macos_companion_bundle_identifier_from_exe(manager_exe, SILENT_BINARY),
        None
    );
}

#[cfg(target_os = "macos")]
#[test]
fn macos_companion_path_falls_back_to_workspace_release_launcher() {
    let root = tempfile::tempdir().unwrap();
    let bundle_exe = root.path().join(
        "target/release/bundle/macos/JanCode Manager.app/Contents/MacOS/jancode-manager",
    );
    let release_launcher = root.path().join("target/release/jancode");
    std::fs::create_dir_all(bundle_exe.parent().unwrap()).unwrap();
    std::fs::create_dir_all(release_launcher.parent().unwrap()).unwrap();
    std::fs::write(&bundle_exe, b"manager").unwrap();
    std::fs::write(&release_launcher, b"launcher").unwrap();

    assert_eq!(
        companion_binary_path_from_exe(&bundle_exe, SILENT_BINARY),
        release_launcher
    );
}

#[test]
fn macos_bundle_does_not_wrap_the_bundle_executable_in_itself() {
    let options = InstallOptions {
        install_root: Some("/Applications".into()),
        launcher_path: Some("/Applications/JanCode.app/Contents/MacOS/JanCode".into()),
        manager_path: Some(
            "/Applications/JanCode 管理工具.app/Contents/MacOS/JanCodeManager".into(),
        ),
        remove_owned_data: false,
    };

    let silent = build_macos_app_bundle(&options, false);
    let manager = build_macos_app_bundle(&options, true);

    assert_eq!(
        silent.binary_source,
        Some(std::path::PathBuf::from(
            "/Applications/JanCode.app/Contents/MacOS/JanCode"
        ))
    );
    assert_eq!(
        manager.binary_source,
        Some(std::path::PathBuf::from(
            "/Applications/JanCode 管理工具.app/Contents/MacOS/JanCodeManager"
        ))
    );
    assert!(silent.launch_script.contains("$DIR/jancode"));
    assert!(
        manager
            .launch_script
            .contains("$DIR/jancode-manager")
    );
}

#[test]
fn windows_default_install_root_uses_known_folder_before_userprofile_desktop() {
    let strategy = default_install_root_strategy();

    if cfg!(windows) {
        assert_eq!(strategy, "windows-known-folder");
    } else if cfg!(target_os = "macos") {
        assert_eq!(strategy, "macos-applications");
    } else {
        assert_eq!(strategy, "user-dirs-desktop");
    }
}
