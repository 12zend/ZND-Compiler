import type { PrimitiveValue } from './scratch';
import type { AssetReference } from './scratch';
export interface IRVariable {
    id: string;
    name: string;
    value: PrimitiveValue;
    isCloud: boolean;
    isLocal: boolean;
    ownerId: string | null;
}
export interface IRList {
    id: string;
    name: string;
    contents: PrimitiveValue[];
    isLocal: boolean;
    ownerId: string | null;
}
export interface IRCostume {
    id: string;
    name: string;
    dataFormat: string;
    rotationCenterX: number;
    rotationCenterY: number;
    assetRef: string;
}
export interface IRSound {
    id: string;
    name: string;
    assetRef: string;
    duration: number;
}
export interface IRScript {
    id: string;
    targetId: string;
    blockId: string;
    isHat: boolean;
    hatOpcode: string;
    topBlock: IRBlock;
    parameterDefs: IRParameter[];
}
export interface IRParameter {
    id: string;
    name: string;
    type: 'number' | 'string' | 'boolean';
    defaultValue: PrimitiveValue;
}
export type IRNodeType = 'start' | 'wait' | 'repeat' | 'forever' | 'if' | 'ifElse' | 'broadcast' | 'broadcastAndWait' | 'setVariable' | 'changeVariable' | 'addToList' | 'deleteOfList' | 'insertOfList' | 'replaceOfList' | 'expression' | 'clone' | 'deleteClone' | 'stop' | 'callCustomBlock' | 'return' | 'operator' | 'motion' | 'looks' | 'sensing' | 'pen' | 'control' | 'merge' | 'noop';
export interface IRBlock {
    id: string;
    type: IRNodeType;
    opcode: string;
    fields: Record<string, any>;
    inputs: Record<string, IRValue | IRValue[]>;
    next: IRBlock | null;
    parent: IRBlock | null;
    comments?: string;
    sourceLocation?: {
        line: number;
        column: number;
    };
}
export interface IRValue {
    type: 'literal' | 'variable' | 'list' | 'block' | 'parameter' | 'broadcast';
    value: PrimitiveValue | string;
    blockRef?: string;
}
export interface IRSprite {
    id: string;
    name: string;
    scripts: IRScript[];
    variables: Map<string, IRVariable>;
    lists: Map<string, IRList>;
    costumes: IRCostume[];
    sounds: IRSound[];
    defaultX: number;
    defaultY: number;
    defaultDirection: number;
    defaultSize: number;
    defaultRotationStyle: string;
    defaultVisible: boolean;
    defaultDraggable: boolean;
    isStage: boolean;
}
export interface IRProgram {
    id: string;
    sprites: Map<string, IRSprite>;
    globalVariables: Map<string, IRVariable>;
    globalLists: Map<string, IRList>;
    orderedSprites: IRSprite[];
    metadata: ProgramMetadata;
}
export interface ProgramMetadata {
    hasCloudVariables: boolean;
    hasPenExtension: boolean;
    hasVideoExtension: boolean;
    hasTextToSpeech: boolean;
    estimatedComplexity: number;
    estimatedMemoryUsage: number;
    gpuCompatible: boolean;
}
export interface CompiledScript {
    scriptId: string;
    targetId: string;
    hatOpcode: string;
    parameters: IRParameter[];
    compiledCode: GeneratedCode;
    dependencies: string[];
    staticAnalysis: StaticAnalysisResult;
}
export interface GeneratedCode {
    type: 'sync' | 'async' | 'generator';
    code: string;
    requiredGlobals: string[];
    requiredFunctions: string[];
    gpuOps: GPUOperation[];
    estimatedCycles: number;
}
export interface GPUOperation {
    opcode: string;
    target: string;
    params: Record<string, any>;
    priority: 'high' | 'medium' | 'low';
    batchable: boolean;
}
export interface StaticAnalysisResult {
    hasSideEffects: boolean;
    hasLoops: boolean;
    hasBroadcast: boolean;
    hasClone: boolean;
    complexity: number;
    warnings: AnalysisWarning[];
}
export interface AnalysisWarning {
    type: 'performance' | 'compatibility' | 'memory';
    code: string;
    message: string;
    location?: {
        blockId: string;
    };
}
export interface CompiledProgram {
    ir: IRProgram;
    scripts: CompiledScript[];
    globalInitCode: string;
    spriteInitCode: Map<string, string>;
    shaderSources: Map<string, string>;
    assetManifest: AssetReference[];
    version: string;
}
//# sourceMappingURL=ir.d.ts.map