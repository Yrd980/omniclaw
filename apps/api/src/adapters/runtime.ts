import type { JsonObject, Task } from "../types";

export type RuntimeDispatchResult = {
  accepted: boolean;
  resultPayload?: JsonObject;
  artifacts?: unknown[];
};

export interface RuntimeAdapter {
  dispatch(task: Task): Promise<RuntimeDispatchResult>;
}

export class MockRuntimeAdapter implements RuntimeAdapter {
  async dispatch(task: Task): Promise<RuntimeDispatchResult> {
    return {
      accepted: true,
      resultPayload: {
        task_id: task.id,
        mock: true,
        echo: task.taskPayload,
      },
      artifacts: [],
    };
  }
}
