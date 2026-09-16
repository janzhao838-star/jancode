Unicode true
!include "MUI2.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!define ROOT "..\..\.."

Name "JanCode"
OutFile "${ROOT}\dist\windows\JanCode-${VERSION}-windows-x64-setup.exe"
InstallDir "$LOCALAPPDATA\Programs\JanCode"
InstallDirRegKey HKCU "Software\JanCode" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"
!define MUI_UNICON "${ROOT}\apps\codex-plus-manager\src-tauri\icons\icon.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"

  nsExec::ExecToLog 'taskkill /IM jancode.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM jancode-manager.exe /F'
  Pop $0

  File "${ROOT}\dist\windows\app\jancode.exe"
  File "${ROOT}\dist\windows\app\jancode-manager.exe"


  CreateShortcut "$DESKTOP\JanCode.lnk" "$INSTDIR\jancode.exe" "" "$INSTDIR\jancode.exe"
  CreateShortcut "$DESKTOP\JanCode 管理工具.lnk" "$INSTDIR\jancode-manager.exe" "" "$INSTDIR\jancode-manager.exe"
  CreateDirectory "$SMPROGRAMS\JanCode"
  CreateShortcut "$SMPROGRAMS\JanCode\JanCode.lnk" "$INSTDIR\jancode.exe" "" "$INSTDIR\jancode.exe"
  CreateShortcut "$SMPROGRAMS\JanCode\JanCode 管理工具.lnk" "$INSTDIR\jancode-manager.exe" "" "$INSTDIR\jancode-manager.exe"
  CreateShortcut "$SMPROGRAMS\JanCode\卸载 JanCode.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\jancode-manager.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\JanCode" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JanCode" "DisplayName" "JanCode"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JanCode" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JanCode" "Publisher" "janzhao"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JanCode" "DisplayIcon" "$INSTDIR\jancode-manager.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JanCode" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JanCode" "UninstallString" "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'taskkill /IM jancode.exe /F'
  Pop $0
  nsExec::ExecToLog 'taskkill /IM jancode-manager.exe /F'
  Pop $0

  Delete "$DESKTOP\JanCode.lnk"
  Delete "$DESKTOP\JanCode 管理工具.lnk"
  Delete "$SMPROGRAMS\JanCode\JanCode.lnk"
  Delete "$SMPROGRAMS\JanCode\JanCode 管理工具.lnk"
  Delete "$SMPROGRAMS\JanCode\卸载 JanCode.lnk"
  RMDir "$SMPROGRAMS\JanCode"

  Delete "$INSTDIR\jancode.exe"
  Delete "$INSTDIR\jancode-manager.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\JanCode"
  DeleteRegKey HKCU "Software\JanCode"
SectionEnd
