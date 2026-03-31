import { ZNDInstance } from './index';
export type Route = 'home' | 'player' | 'error';
export interface AppState {
    route: Route;
    projectId: string | null;
    error: string | null;
    loading: boolean;
    instance: ZNDInstance | null;
}
//# sourceMappingURL=app.d.ts.map