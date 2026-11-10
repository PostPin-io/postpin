; Windows installer for the PostPin plugin for DaVinci Resolve.
;
; makensis -DVERSION=<version> -DSTAGE=<dir> -DOUT=<file.exe> installer.nsi
; STAGE holds the plugin files (dist/ without source maps and without WorkflowIntegration.node) plus
; WorkflowIntegration.x64.node and WorkflowIntegration.arm64.node. Resolve for Windows on ARM ships
; its own build of the module, so the installer installs the one that matches the machine.
Unicode true
!include MUI2.nsh
!include x64.nsh
!include LogicLib.nsh

!define PLUGIN_ID "io.postpin.plugin.resolve"
!define NAME "PostPin for DaVinci Resolve"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PLUGIN_ID}"
!define RESOLVE_PLUGINS "Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"

; 0.2.0-rc.1 -> 0.2.0.0, Windows file versions are numeric
; (the appended "-" makes the pattern match versions without a pre-release suffix too)
!searchparse "${VERSION}-" "" VERSION_MAJOR "." VERSION_MINOR "." VERSION_PATCH "-"

Name "${NAME}"
OutFile "${OUT}"
RequestExecutionLevel admin
ShowInstDetails show
VIProductVersion "${VERSION_MAJOR}.${VERSION_MINOR}.${VERSION_PATCH}.0"
VIAddVersionKey "ProductName" "${NAME}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${NAME} Setup"
VIAddVersionKey "CompanyName" "PostPin"
VIAddVersionKey "LegalCopyright" "PostPin"

!define MUI_FINISHPAGE_TITLE "${NAME} is installed"
!define MUI_FINISHPAGE_TEXT "Restart DaVinci Resolve Studio, then open the plugin from Workspace > Workflow Integrations > PostPin."
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Function .onInit
	; ProgramData, not the user's AppData
	SetShellVarContext all
	SetRegView 64
	StrCpy $INSTDIR "$APPDATA\${RESOLVE_PLUGINS}\${PLUGIN_ID}"
FunctionEnd

Function un.onInit
	SetShellVarContext all
	SetRegView 64
FunctionEnd

Section
	; Remove the previous version first so no stale files stay behind
	RMDir /r "$INSTDIR"
	SetOutPath "$INSTDIR"
	File /r /x "WorkflowIntegration.*.node" "${STAGE}/*"
	${If} ${IsNativeARM64}
		File "/oname=WorkflowIntegration.node" "${STAGE}/WorkflowIntegration.arm64.node"
	${Else}
		File "/oname=WorkflowIntegration.node" "${STAGE}/WorkflowIntegration.x64.node"
	${EndIf}

	WriteUninstaller "$INSTDIR\uninstall.exe"
	WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${NAME}"
	WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
	WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "PostPin"
	WriteRegStr HKLM "${UNINSTALL_KEY}" "URLInfoAbout" "https://postpin.io"
	WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
	WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
	WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
	WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
	RMDir /r "$INSTDIR"
	DeleteRegKey HKLM "${UNINSTALL_KEY}"
SectionEnd
