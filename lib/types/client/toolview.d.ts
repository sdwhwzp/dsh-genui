import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/**
 * Keyed toolview for the `render_ui` tool. `block` is the settled result
 * node once the call completes; while it runs (or on replay without meta)
 * the summary fallback is shown.
 */
export declare function GenuiToolView({ toolName, block, sessionId }: ToolCallViewProps & {
    sessionId: SessionId;
}): import("react").JSX.Element;
