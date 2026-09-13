import { useState } from "@revolt/state";
import { Checkbox, Column } from "@revolt/ui";

/**
 * Advanced settings
 */
export default function AdvancedSettings() {
  const state = useState();

  return (
    <Column gap="xl">
      <Column>
        <Checkbox
          checked={state.settings.getValue("appearance:compact_mode")}
          onChange={(e) =>
            state.settings.setValue(
              "appearance:compact_mode",
              e.currentTarget.checked,
            )
          }
        >
          Compact mode
        </Checkbox>
        <Checkbox
          checked={state.settings.getValue("advanced:copy_id")}
          onChange={(e) =>
            state.settings.setValue("advanced:copy_id", e.currentTarget.checked)
          }
        >
          Show 'copy ID' in context menus
        </Checkbox>
      </Column>
    </Column>
  );
}
