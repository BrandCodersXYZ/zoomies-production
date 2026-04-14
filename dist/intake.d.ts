import { PipelineState } from './types';
export declare function saveState(state: PipelineState): void;
export declare function loadState(): PipelineState | null;
export declare function runIntake(scriptInput: string, isFilePath: boolean): Promise<PipelineState>;
//# sourceMappingURL=intake.d.ts.map