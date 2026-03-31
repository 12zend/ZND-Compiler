# Scratch高速実行環境「ZND Compiler」設計仕様書

## 1. 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ZND Compiler Stack                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   UI Layer  │  │  Render    │  │   Audio    │  │    Debugger         │ │
│  │  (Canvas)   │◄─┤  (WebGL2)  │  │  Manager   │  │   (Diagnostic)       │ │
│  └──────┬──────┘  └──────▲──────┘  └─────▲─────┘  └─────────────────────┘ │
│         │               │               │                                  │
│  ┌──────▼───────────────▼───────────────▼──────────────────────────────┐  │
│  │                      Execution Engine (JIT/AOT)                       │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │  │
│  │  │Scheduler│  │Runtime  │  │ Sprite  │  │  Event  │  │  Clone      │  │  │
│  │  │(Task Q) │  │Context  │  │ Manager │  │ System  │  │  Manager    │  │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                   IR (Intermediate Representation)                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │   │
│  │  │AST/Blocks│─▶│Control   │─▶│Expression│─▶│Asset     │             │   │
│  │  │ Parser   │  │Flow IR   │  │Evaluator │  │Manifest  │             │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      Code Generator (JS Emit)                         │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │   │
│  │  │Block→JS    │  │Static      │  │Dynamic     │  │GPU Shader     │  │   │
│  │  │Emitter     │  │Analyzer    │  │Fallback    │  │Generator      │  │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Project Loader                               │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────┐  │   │
│  │  │ID Resolver │  │SB3→JSON    │  │Asset       │  │Cache           │  │   │
│  │  │(API Fetch) │  │Parser      │  │Preloader   │  │Manager         │  │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. データフロー

```
Scratch Project ID
       │
       ▼
┌──────────────────┐
│  Project Fetcher │ ─── API呼び出し (scratch.mit.edu/api/projects/:id/)
└────────┬─────────┘
         │ sb3 (zip)
         ▼
┌──────────────────┐
│  SB3 Extractor   │ ─── JSON + メディア分離
└────────┬─────────┘
         │ project.json
         ▼
┌──────────────────┐
│   Block Parser   │ ─── JSON → AST (スクラッチブロック → 内部表現)
└────────┬─────────┘
         │ Script[]
         ▼
┌──────────────────┐
│  Static Analyzer │ ─── フロー解析、不要コード除去、定数畳み込み
└────────┬─────────┘
         │ OptimizedIR
         ▼
┌──────────────────┐
│  Code Generator │ ─── JavaScript / WebGL Shader 生成
└────────┬─────────┘
         │ CompiledScript[]
         ▼
┌──────────────────┐
│  Asset Loader    │ ─── メディア（画像・音声）の非同期ロード
└────────┬─────────┘
         │ LoadedAssets
         ▼
┌──────────────────┐
│   VM Integration │ ─── Scratch VM + カスタムレンダラー
└────────┬─────────┘
         │
         ▼
    Execution Loop
         │
    ┌────┴────┐
    │  CPU    │ ← スクリプトロジック、変数演算、制御フロー
    │  Path   │
    └────┬────┘
    ┌────▼────┐
    │  GPU    │ ← 描画、フィルタ、画像変換、幾何変換
    │  Path   │
    └─────────┘
```

## 3. 主要モジュール設計

### 3.1 プロジェクトローダー (`ProjectLoader`)

```typescript
interface ProjectLoader {
  fetch(id: string): Promise<SB3Project>
  extract(project: Blob): Promise<ExtractedProject>
  preloadAssets(manifest: AssetManifest): Promise<LoadedAssets>
}
```

### 3.2 パーサー (`BlockParser`)

```typescript
interface BlockParser {
  parse(json: ScratchProjectJSON): IRProgram
  parseScript(script: ScriptBlock[]): IRBlock[]
  resolveOpcode(opcode: string): OpCodeHandler
}
```

### 3.3 中間表現 (`IR`)

```typescript
// 基本IR型
type IRNode = 
  | IRStart
  | IRWait
  | IRRepeat
  | IRForever
  | IRIf
  | IRBroadcast
  | IRSetVariable
  | IRExpression
  | IRClone
  | IRCallCustomBlock

interface IRProgram {
  sprites: Map<string, IRSprite>
  globalVariables: Map<string, IRVariable>
  globalLists: Map<string, IRList>
  costumes: AssetReference[]
  sounds: AssetReference[]
}

interface IRSprite {
  name: string
  scripts: IRScript[]
  variables: Map<string, IRVariable>
  lists: Map<string, IRList>
  costumes: CostumeReference[]
  sounds: SoundReference[]
}
```

### 3.4 コード生成器 (`JSCodeGenerator`)

```typescript
interface JSCodeGenerator {
  generateProgram(ir: IRProgram): CompiledProgram
  generateScript(sprite: IRSprite, script: IRScript): CompiledScript
  generateBlock(block: IRBlock, ctx: CodeGenContext): GeneratedCode
  optimize(code: GeneratedCode): OptimizedCode
}
```

### 3.5 実行エンジン (`ExecutionEngine`)

```typescript
interface ExecutionEngine {
  load(compiled: CompiledProgram): RuntimeContext
  start(spriteId: string, scriptId: string): void
  stop(spriteId: string, scriptId: string): void
  step(): void
  broadcast(message: string, args?: any[]): void
}
```

### 3.6 WebGLレンダラー (`WebGLRenderer`)

```typescript
interface WebGLRenderer {
  init(canvas: HTMLCanvasElement): void
  renderSprite(sprite: SpriteInstance): void
  applyFilters(effects: Effects): void
  drawCostume(costume: Costume, x: number, y: number, scale: number, rotation: number): void
  setGPUProgram(gpuType: GPUComputeType): void
}
```

## 4. コンパイル戦略

### 4.1 静的解析フェーズ

```
1. データフロー解析 (Def-Use連鎖)
   - 変数の生存期間決定
   - オブジェクトプール配置
   
2. 制御フロー解析
   - 基本ブロック分割
   - ループ出不lop最適化
   - 条件分岐平坦化（深いネストを浅く）
   
3. 定数畳み込み
   - 即値計算の事前実行
   - 変化しない変数の定数化
   
4. 不要コード除去
   - デッドコード除去
   - 到達不能コード除去
```

### 4.2 動的最適化フェーズ

```
1. ポリモーフィックインラインキャッシュ
   - ブロック型呼び出しの特殊化
   
2. Delayed Clone
   - クローン生成の遅延評価
   
3. Batched Updates
   - 同一フレーム内の複数描画更新を統合
```

## 5. CPU/GPU振り分け戦略

```typescript
// 判定基準
const GPU_ELIGIBLE_OPS = new Set([
  'looks_gotofrontback',
  'looks_gobackfront',
  'looks_switchcostumeto',
  'looks_nextcostume',
  'looks_seteffectto',
  'looks_changeeffectby',
  'looks_hide',
  'looks_show',
  'looks_setsizeto',
  'looks_changesizeby',
  'looks_switchbackdropto',
  'looks_nextbackdrop',
  'motion_goto',
  'motion_setx',
  'motion_sety',
  'motion_changexby',
  'motion_changeyby',
  'motion_setrotationstyle',
  'motion_turnright',
  'motion_turnleft',
  'motion_pointindirection',
  'motion_pointtowards',
  'motion_glideto',
  'video_videoon',
  'pen_penup',
  'pen_pendown',
  'pen_setpencolortocolor',
  'pen_changepensizeby',
  'pen_changepencolorby',
  'pen_stamp',
  'video_draw',
])

// 判定関数
function shouldUseGPU(opcode: string, context: RenderContext): boolean {
  if (!context.gpuAvailable) return false
  if (context.frameBudget < 16) return false // 60fps維持が困難な場合
  if (GPU_ELIGIBLE_OPS.has(opcode)) return true
  return false
}
```

## 6. WebGL活用戦略

### 6.1 レンダリングパイプライン

```
┌──────────────────────────────────────────────────────────────┐
│                     WebGL2 Rendering Pipeline                  │
├──────────────────────────────────────────────────────────────┤
│  Input → Vertex Shader → Tessellation → Geometry Shader →   │
│  Rasterization → Fragment Shader → Post-Processing → Output   │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 GPU処理対象

| 処理内容 | シェーダー種 | 期待される高速化率 |
|---------|-------------|-------------------|
| スプライト描画 | 2D Billboard | 10-50x |
| フィルタ/エフェクト | Fragment Shader | 5-30x |
| 幾何変換 | Transform Shader | 3-10x |
| 衝突判定 | Compute Shader | 2-5x |
| パーティクル | GPU Particles | 20-100x |

## 7. 最適化戦略

### 7.1 メモリ最適化

```typescript
// オブジェクトプール
class ObjectPool<T> {
  private pool: T[] = []
  private active: Set<T> = new Set()
  
  acquire(factory: () => T): T {
    if (this.pool.length > 0) {
      const obj = this.pool.pop()!
      this.active.add(obj)
      return obj
    }
    const obj = factory()
    this.active.add(obj)
    return obj
  }
  
  release(obj: T): void {
    this.active.delete(obj)
    this.pool.push(obj)
  }
}

// 利用箇所
const spritePool = new ObjectPool<SpriteInstance>(() => new SpriteInstance())
const vectorPool = new ObjectPool<IRVector>(() => new IRVector())
```

### 7.2 イベントスケジューラ

```typescript
class LightweightScheduler {
  private taskQueue: Task[] = []
  private scheduled: Map<string, number> = new Map()
  private frameTime = 0
  
  schedule(task: Task, delay: number = 0): void {
    const key = `${task.type}:${task.target}:${task.script}`
    if (this.scheduled.has(key)) return // 重複防止
    this.scheduled.set(key, this.frameTime + delay)
    this.taskQueue.push(task)
  }
  
  processFrame(deltaTime: number): void {
    this.frameTime += deltaTime
    const now = this.frameTime
    const batch = this.taskQueue.filter(t => 
      (this.scheduled.get(`${t.type}:${t.target}:${t.script}`) || 0) <= now
    )
    for (const task of batch) {
      task.execute()
      this.scheduled.delete(`${task.type}:${task.target}:${task.script}`)
    }
  }
}
```

## 8. キャッシュ戦略

```typescript
interface CacheStrategy {
  // L1: コンパイル済みスクリプト (IndexedDB)
  compiledScripts: LRUCache<string, CompiledScript>
  
  // L2: アセットバイナリ (Cache API)
  assetCache: Cache
  
  // L3: プロジェクトメタデータ (Memory)
  projectMeta: Map<string, ProjectMetadata>
}

// IndexedDBスキーマ
const DB_SCHEMA = {
  stores: {
    compiledProjects: { keyPath: 'id', indexes: ['lastAccessed'] },
    assets: { keyPath: 'hash', indexes: ['type', 'projectId'] },
    metadata: { keyPath: 'projectId' }
  }
}
```

## 9. MVP実装範囲

### Phase 1: コア機能
1. プロジェクト取得 (ID指定)
2. SB3→JSON解析
3. ブロック→IR変換
4. 基本ブロックコンパイル (動き・見た目)
5. Canvas 2D描画
6. 変数・リスト基本対応

### Phase 2: 拡張機能
1. イベントシステム
2. 制御ブロック (ループ・条件)
3. 演算ブロック
4. メッセージ送受信
5. クローン生成

### Phase 3: 最適化
1. WebGLレンダラー
2. 静的最適化
3. オブジェクトプール
4. キャッシュ層

## 10. 実装上の注意点

1. **Scratch VMの命令セット**: 100%再現は不要。コアブロックに注力
2. **エラー報告**: ブロック単位のerror contextを提供
3. **デバッグ**: Source map相当のブロック位置情報を保持
4. **メモリリーク**: クローン・オブジェクトは必ず解放
5. **ガベージコレクション**: 大量オブジェクト時は手動解放促す
