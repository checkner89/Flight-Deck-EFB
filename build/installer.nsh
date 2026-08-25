!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER

Var ThirdPartyDialog
Var ThirdPartyText
Var DesktopShortcutCheckbox
Var DesktopShortcutSelection

!macro customInit
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
  !insertmacro MUI_HEADER_TEXT "Third-party notices" "Open-source software, data sources and optional compatibility services"

  nsDialogs::Create 1018
  Pop $ThirdPartyDialog
  ${If} $ThirdPartyDialog == error
    Abort
  ${EndIf}

  nsDialogs::CreateControl EDIT ${DEFAULT_STYLES}|${WS_TABSTOP}|${WS_VSCROLL}|${ES_MULTILINE}|${ES_READONLY}|${ES_AUTOVSCROLL}|${WS_BORDER} ${WS_EX_CLIENTEDGE} 0 0 100% 100% ""
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
  !insertmacro MUI_HEADER_TEXT "Additional Tasks" "Select the additional tasks you would like Setup to perform."

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Select additional tasks, then click Next."
  Pop $1

  ${NSD_CreateCheckbox} 0 30u 100% 14u "Create a Desktop Shortcut"
  Pop $DesktopShortcutCheckbox
  ${NSD_Check} $DesktopShortcutCheckbox

  ${NSD_CreateLabel} 0 58u 100% 38u "A Start Menu shortcut is always created. Updates preserve your local Flight Deck EFB data."
  Pop $1

  nsDialogs::Show
FunctionEnd

Function AdditionalTasksPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $DesktopShortcutSelection
FunctionEnd

!macro customInstall
  ; electron-builder creates its configured desktop shortcut during install.
  ; Remove it only when the interactive Additional Tasks page was explicitly
  ; unchecked. Silent updates keep the initialized checked state.
  ${If} $DesktopShortcutSelection != ${BST_CHECKED}
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  ${EndIf}
!macroend

!endif
