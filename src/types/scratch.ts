export type PrimitiveValue = string | number | boolean | null;
export type ListValue = PrimitiveValue[];
export type FieldValue = { id?: string; name: string };
export type InputValue = { name: string; id?: string } | PrimitiveValue;

export interface ScratchBlock {
  id: string;
  opcode: string;
  next: string | null;
  parent: string | null;
  shadow: boolean;
  mutation?: {
    tagName?: string;
    children?: string[];
    text?: string;
    proccode?: string;
    argumentids?: string;
    argumentnames?: string;
    argumentdefaults?: string;
    warp?: string;
  };
  fields: Record<string, FieldValue>;
  inputs: Record<string, [number, InputValue | InputValue[]]>;
}

export interface ScratchTarget {
  isStage: boolean;
  name: string;
  variables: Record<string, [string, PrimitiveValue]>;
  lists: Record<string, [string, ListValue]>;
  broadcasts: Record<string, string>;
  blocks: Record<string, ScratchBlock | null>;
  comments: Record<string, unknown>;
  currentCostume: number;
  costumes: Costume[];
  sounds: Sound[];
  volume: number;
  layerOrder: number;
  visible: boolean;
  x: number;
  y: number;
  size: number;
  direction: number;
  draggable: boolean;
  rotationStyle: 'all-around' | 'left-right' | 'don\'t rotate';
}

export interface Costume {
  assetId: string;
  name: string;
  md5ext: string;
  dataFormat: 'svg' | 'png' | 'jpg' | 'gif';
  rotationCenterX: number;
  rotationCenterY: number;
  bitmapResolution?: number;
  skinId?: number;
}

export interface Sound {
  assetId: string;
  name: string;
  md5ext: string;
  dataFormat: 'wav' | 'mp3';
  rate: number;
  sampleCount: number;
  soundInfo: Record<string, unknown>;
}

export interface ScratchProjectJSON {
  targets: ScratchTarget[];
  monitors: unknown[];
  extensions: string[];
  meta: {
    semver: string;
    vm: string;
    agent: string;
  };
}

export interface SB3Project {
  id: string;
  json: ScratchProjectJSON;
  assets: Map<string, ArrayBuffer>;
  thumbnail?: ArrayBuffer;
}

export interface ExtractedProject {
  projectJson: ScratchProjectJSON;
  assets: Map<string, ArrayBuffer>;
}

export interface AssetManifest {
  costumes: AssetReference[];
  sounds: AssetReference[];
  totalSize: number;
}

export interface AssetReference {
  id: string;
  name: string;
  type: 'costume' | 'sound';
  md5ext: string;
  dataFormat: string;
  rotationCenterX?: number;
  rotationCenterY?: number;
}

export interface LoadedAssets {
  costumes: Map<string, HTMLImageElement>;
  sounds: Map<string, AudioBuffer>;
  vectors: Map<string, Path2D>;
}
