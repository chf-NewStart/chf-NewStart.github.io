#!/usr/bin/env python3
"""Make "Tend focus", a ready-made shortcut: Tend's "Start a focus session" (Siri asks what you're working on), then
Set Focus: Do Not Disturb on until the time the session ends. iOS doesn't let an app turn on a Focus; Shortcuts can.

    python3 apps/tend-ios/scripts/make_focus_shortcut.py build/shortcut
    shortcuts sign --mode anyone --input "build/shortcut/Tend focus.unsigned.shortcut" --output "build/shortcut/Tend focus.shortcut"
"""
import plistlib
import sys
import uuid
from pathlib import Path

out = Path(sys.argv[1] if len(sys.argv) > 1 else "build/shortcut")
out.mkdir(parents=True, exist_ok=True)
start = str(uuid.uuid4()).upper()
actions = [
    {   # Tend's App Intent; its question is left empty so Siri asks "What are you working on?".
        "WFWorkflowActionIdentifier": "com.houfu72.tend.StartFocusIntent",
        "WFWorkflowActionParameters": {
            "AppIntentDescriptor": {"AppIntentIdentifier": "StartFocusIntent", "BundleIdentifier": "com.houfu72.tend",
                                    "Name": "Tend", "TeamIdentifier": "DCC763A996"},
            "UUID": start,
        },
    },
    {   # Set Focus: Do Not Disturb, Turn On, Until: the end time Tend handed over.
        "WFWorkflowActionIdentifier": "is.workflow.actions.dnd.set",
        "WFWorkflowActionParameters": {
            "Operation": "Turn",
            "Enabled": 1,
            "FocusModes": {"Identifier": "com.apple.donotdisturb.mode.default", "DisplayString": "Do Not Disturb"},
            "AssertionType": "Time",
            # As the Shortcuts editor saves a variable in this field: a one-character token string.
            "Time": {"Value": {"string": "￼", "attachmentsByRange": {"{0, 1}": {
                         "OutputName": "Start a focus session", "OutputUUID": start, "Type": "ActionOutput"}}},
                     "WFSerializationType": "WFTextTokenString"},
            "UUID": str(uuid.uuid4()).upper(),
        },
    },
]
shortcut = {
    "WFWorkflowActions": actions,
    "WFWorkflowClientVersion": "3000.0.0",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconGlyphNumber": 59446, "WFWorkflowIconStartColor": 4282601983},
    "WFWorkflowImportQuestions": [],
    "WFWorkflowInputContentItemClasses": [],
    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowTypes": [],
    "WFWorkflowHasShortcutInputVariables": False,
    "WFQuickActionSurfaces": [],
}
path = out / "Tend focus.unsigned.shortcut"
path.write_bytes(plistlib.dumps(shortcut, fmt=plistlib.FMT_BINARY))
print(path)
