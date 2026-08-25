!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER

Var ThirdPartyDialog
Var ThirdPartyText
Var DesktopShortcutCheckbox
Var DesktopShortcutSelection

!macro customInit
  ; Keep the current electron-builder default: a normal interactive first install
  ; creates a desktop shortcut unless the user explicitly opts out below.
  StrCpy $DesktopShortcutSelection ${BST_CHECKED}
!macroend

!macro customPageAfterChangeDir
  ; electron-builder inserts this hook after the install-directory page and
  ; before files are installed. Updated/silent installs skip both custom pages.
  Page custom ThirdPartyPageCreate
  Page custom AdditionalTasksPageCreate AdditionalTasksPageLeave
!macroend

Function ThirdPartyPageCreate
  ${If} ${isUpdated}
    Abort
  ${EndIf}
  ${If} ${Silent}
    Abort
  ${EndIf}

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
  ${If} ${isUpdated}
    Abort
  ${EndIf}
  ${If} ${Silent}
    Abort
  ${EndIf}

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

  ${NSD_CreateLabel} 0 58u 100% 38u "A Start Menu shortcut is always created. Updates preserve your existing application data and shortcut choices whenever possible."
  Pop $1

  nsDialogs::Show
FunctionEnd

Function AdditionalTasksPageLeave
  ${NSD_GetState} $DesktopShortcutCheckbox $DesktopShortcutSelection
FunctionEnd

!macro customInstall
  ; electron-builder creates the normal shortcut first. On a fresh interactive
  ; install we remove only the desktop link if the user explicitly opted out.
  ; Update installs do not run the opt-out path, so an existing user choice is
  ; not intentionally changed by this custom page.
  ${IfNot} ${isUpdated}
    ${If} $DesktopShortcutSelection != ${BST_CHECKED}
      Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend

!endif
