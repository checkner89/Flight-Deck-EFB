!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER

Var ThirdPartyDialog
Var ThirdPartyText
Var DesktopShortcutCheckbox
Var DesktopShortcutSelection

!macro customInit
  ; A normal window close only hides FLYXORA to the tray. An old tray process can
  ; therefore survive a manual upgrade and keep presenting the previous renderer.
  ; Setup owns the upgrade boundary, so terminate both the current and legacy
  ; executable names before files/shortcuts are replaced. Exit codes are ignored
  ; when no matching process exists.
  nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /IM "FLYXORA.exe" /T /F'
  Pop $0
  Pop $1
  nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /IM "Flight Deck EFB.exe" /T /F'
  Pop $0
  Pop $1
  Sleep 450

  ; Interactive installs default to creating a desktop shortcut. Silent
  ; auto-updates do not render wizard pages and therefore keep this default.
  StrCpy $DesktopShortcutSelection ${BST_CHECKED}
!macroend

!macro customPageAfterChangeDir
  ; These pages are part of the assisted installer. NSIS automatically skips
  ; wizard pages when the updater launches the installer silently (/S).
  Page custom ThirdPartyPageCreate
  Page custom AdditionalTasksPageCreate AdditionalTasksPageLeave
!macroend

Function ThirdPartyPageCreate
  nsDialogs::Create 1018
  Pop $ThirdPartyDialog
  ${If} $ThirdPartyDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 14u "Third-party notices"
  Pop $0
  ${NSD_CreateLabel} 0 17u 100% 20u "Open-source software, data sources and optional compatibility services used by Flight Deck EFB."
  Pop $0

  nsDialogs::CreateControl EDIT ${DEFAULT_STYLES}|${WS_TABSTOP}|${WS_VSCROLL}|${ES_MULTILINE}|${ES_READONLY}|${ES_AUTOVSCROLL} ${WS_EX_CLIENTEDGE} 0 42u 100% -42u ""
  Pop $ThirdPartyText

  File /oname=$PLUGINSDIR\flight-deck-third-party-notices.txt "${BUILD_RESOURCES_DIR}\third-party-notices.txt"
  FileOpen $0 "$PLUGINSDIR\flight-deck-third-party-notices.txt" r
  ${IfNot} ${Errors}
    ThirdPartyReadLoop:
      ClearErrors
      FileRead $0 $1
      ${If} ${Errors}
        Goto ThirdPartyReadDone
      ${EndIf}
      SendMessage $ThirdPartyText ${EM_SETSEL} -1 -1
      SendMessage $ThirdPartyText ${EM_REPLACESEL} 0 "STR:$1"
      Goto ThirdPartyReadLoop
    ThirdPartyReadDone:
    FileClose $0
  ${Else}
    ${NSD_SetText} $ThirdPartyText "Third-party notices could not be loaded. The complete THIRD_PARTY_NOTICES.md file is installed with Flight Deck EFB."
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function AdditionalTasksPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 14u "Additional Tasks"
  Pop $1
  ${NSD_CreateLabel} 0 17u 100% 20u "Select the additional tasks you would like Setup to perform, then click Next."
  Pop $1

  ${NSD_CreateCheckbox} 0 48u 100% 14u "Create a Desktop Shortcut"
  Pop $DesktopShortcutCheckbox
  ${NSD_Check} $DesktopShortcutCheckbox

  ${NSD_CreateLabel} 0 76u 100% 38u "A Start Menu shortcut is always created. Uninstalling or updating Flight Deck EFB does not silently delete your local flight history, settings or caches."
  Pop $1

  nsDialogs::Show
FunctionEnd

Function AdditionalTasksPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $DesktopShortcutSelection
FunctionEnd

!macro customInstall
  ; Remove branding-era shortcuts that can still point to an obsolete install.
  Delete "$DESKTOP\Flight Deck EFB.lnk"
  Delete "$SMPROGRAMS\Flight Deck EFB.lnk"

  ; electron-builder creates its configured desktop shortcut during install.
  ; Remove it only when the interactive Additional Tasks page was explicitly
  ; unchecked. Silent updates keep the initialized checked state.
  ${If} $DesktopShortcutSelection != ${BST_CHECKED}
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  ${EndIf}
!macroend

!endif
