import { loadLiveWorkspace } from "@/app/actions/workspace";

let pendingWorkspace: ReturnType<typeof loadLiveWorkspace> | null = null;

export function loadInitialWorkspace() {
  if (!pendingWorkspace) {
    pendingWorkspace = loadLiveWorkspace().finally(() => { pendingWorkspace = null; });
  }
  return pendingWorkspace;
}
