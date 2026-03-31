import type { ScratchProjectJSON } from '../types';
import type { IRProgram, IRScript, StaticAnalysisResult } from '../types/ir';
export declare class BlockParser {
    private interner;
    private blockMap;
    parse(projectJson: ScratchProjectJSON): IRProgram;
    private parseTarget;
    private findTopBlocks;
    private isHatBlock;
    private parseScript;
    private parseBlock;
    private isBlockReference;
    private getIRNodeType;
    private analyzeScriptComplexity;
    private estimateMemoryUsage;
    analyzeStatic(script: IRScript): StaticAnalysisResult;
}
export declare const blockParser: BlockParser;
//# sourceMappingURL=BlockParser.d.ts.map