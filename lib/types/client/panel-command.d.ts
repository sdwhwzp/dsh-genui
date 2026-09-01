import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { GenuiSpec } from './spec.ts';
/** Default panel content published by `/panel`: the component overview. */
export declare const DEFAULT_PANEL_SPEC: GenuiSpec;
/**
 * The /panel source. Menu group `genui` under the '/' trigger; the panel
 * candidate claims the line so both the menu pick and a bare `/panel` enter
 * resolve to the same command. `matchEnter` is implemented so the command
 * works without opening the menu (leading-token adjudication), and it also
 * catches `/panel clear` style args.
 */
export declare function createPanelSlashSource(sendInstruction: (sessionId: SessionId, instruction: string) => void): InputTriggerSource;
