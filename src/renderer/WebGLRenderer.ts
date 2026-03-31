import type { SpriteInstance } from '../core/ExecutionEngine';

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;

uniform mat4 u_projection;
uniform mat4 u_transform;

out vec2 v_texCoord;

void main() {
  gl_Position = u_projection * u_transform * vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 v_texCoord;

uniform sampler2D u_texture;
uniform float u_alpha;
uniform vec4 u_colorMix;

out vec4 fragColor;

void main() {
  vec4 texColor = texture(u_texture, v_texCoord);
  fragColor = vec4(mix(texColor.rgb, u_colorMix.rgb, u_colorMix.a), texColor.a * u_alpha);
}
`;

interface RenderBatch {
  sprites: SpriteInstance[];
  effects: GPUEffect[];
  startTime: number;
}

interface GPUEffect {
  type: 'color' | 'brightness' | 'fisheye' | 'whirl' | 'pixelate' | 'mosaic' | 'blur';
  amount: number;
}

export class WebGLRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private projectionMatrix: Float32Array = new Float32Array(16);
  private textures: Map<string, WebGLTexture> = new Map();
  private currentTexture: WebGLTexture | null = null;
  private batches: RenderBatch[] = [];
  private currentBatch: RenderBatch | null = null;
  private gpuAvailable: boolean = false;
  private frameCount: number = 0;
  private lastGC: number = 0;

  private positionLocation: number = 0;
  private texCoordLocation: number = 0;
  private projectionLocation: WebGLUniformLocation | null = null;
  private transformLocation: WebGLUniformLocation | null = null;
  private textureLocation: WebGLUniformLocation | null = null;
  private alphaLocation: WebGLUniformLocation | null = null;
  private colorMixLocation: WebGLUniformLocation | null = null;

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    });

    if (!gl) {
      console.warn('WebGL2 not available, falling back to Canvas2D');
      this.gpuAvailable = false;
      return;
    }

    this.gl = gl;
    this.gpuAvailable = true;

    this.program = this.createProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    if (!this.program) {
      this.gpuAvailable = false;
      return;
    }

    this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
    this.texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
    this.projectionLocation = gl.getUniformLocation(this.program, 'u_projection');
    this.transformLocation = gl.getUniformLocation(this.program, 'u_transform');
    this.textureLocation = gl.getUniformLocation(this.program, 'u_texture');
    this.alphaLocation = gl.getUniformLocation(this.program, 'u_alpha');
    this.colorMixLocation = gl.getUniformLocation(this.program, 'u_colorMix');

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  0, 1,
       1, -1,  1, 1,
      -1,  1,  0, 0,
       1,  1,  1, 0
    ]), gl.STATIC_DRAW);

    this.setupProjection();
  }

  private createShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    
    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null;

    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program link error:', this.gl.getProgramInfoLog(program));
      this.gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  private setupProjection(): void {
    if (!this.canvas || !this.gl) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    this.projectionMatrix = new Float32Array([
      2 / width, 0, 0, 0,
      0, -2 / height, 0, 0,
      0, 0, 1, 0,
      -1, 1, 0, 1
    ]);
  }

  clear(): void {
    if (!this.gl) return;

    this.gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  }

  renderSprite(sprite: SpriteInstance): void {
    if (!sprite.visible) return;

    if (this.gpuAvailable) {
      this.renderSpriteGPU(sprite);
    } else {
      this.renderSpriteCPU(sprite);
    }
  }

  private renderSpriteGPU(sprite: SpriteInstance): void {
    if (!this.gl || !this.program || !this.canvas) return;

    this.gl.useProgram(this.program);

    const width = sprite.size * 2;
    const height = sprite.size * 2;
    const x = sprite.x + this.canvas.width / 2;
    const y = sprite.y + this.canvas.height / 2;

    const rotation = (sprite.direction - 90) * (Math.PI / 180);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const transformMatrix = new Float32Array([
      width * cos, width * sin, 0, 0,
      -height * sin, height * cos, 0, 0,
      0, 0, 1, 0,
      x, y, 0, 1
    ]);

    this.gl.uniformMatrix4fv(this.projectionLocation, false, this.projectionMatrix);
    this.gl.uniformMatrix4fv(this.transformLocation, false, transformMatrix);
    this.gl.uniform1f(this.alphaLocation, sprite.visible ? 1.0 : 0.0);

    const colorMix = this.calculateEffectColors(sprite.effects);
    this.gl.uniform4f(this.colorMixLocation, colorMix[0], colorMix[1], colorMix[2], colorMix[3]);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);

    this.gl.enableVertexAttribArray(this.positionLocation);
    this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 16, 0);

    this.gl.enableVertexAttribArray(this.texCoordLocation);
    this.gl.vertexAttribPointer(this.texCoordLocation, 2, this.gl.FLOAT, false, 16, 8);

    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private calculateEffectColors(effects: Record<string, number>): [number, number, number, number] {
    let r = 0, g = 0, b = 0, a = 0;

    if (effects.color) {
      r += effects.color / 200;
    }
    if (effects.brightness) {
      const brightness = effects.brightness / 100;
      r += brightness;
      g += brightness;
      b += brightness;
    }
    if (effects.ghost) {
      a = effects.ghost / 100;
    }

    return [r, g, b, a];
  }

  private renderSpriteCPU(sprite: SpriteInstance): void {
  }

  uploadTexture(id: string, image: HTMLImageElement | SVGElement): WebGLTexture | null {
    if (!this.gl) return null;

    let texture = this.textures.get(id);
    if (texture) {
      return texture;
    }

    texture = this.gl.createTexture();
    if (!texture) return null;

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);

    if (image instanceof HTMLImageElement) {
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
    } else {
      const blob = new Blob([image.outerHTML], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
      URL.revokeObjectURL(url);
    }

    this.textures.set(id, texture);
    return texture;
  }

  deleteTexture(id: string): void {
    if (!this.gl) return;

    const texture = this.textures.get(id);
    if (texture) {
      this.gl.deleteTexture(texture);
      this.textures.delete(id);
    }
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.gl) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.setupProjection();
  }

  isGPUAvailable(): boolean {
    return this.gpuAvailable;
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  garbageCollect(): void {
    const now = performance.now();
    if (now - this.lastGC < 5000) return;
    this.lastGC = now;

    if (this.textures.size > 100) {
      const toDelete: string[] = [];
      let count = 0;
      for (const id of this.textures.keys()) {
        if (count++ < 20) {
          toDelete.push(id);
        }
      }
      for (const id of toDelete) {
        this.deleteTexture(id);
      }
    }
  }

  destroy(): void {
    if (!this.gl) return;

    for (const texture of this.textures.values()) {
      this.gl.deleteTexture(texture);
    }
    this.textures.clear();

    if (this.quadBuffer) {
      this.gl.deleteBuffer(this.quadBuffer);
    }

    if (this.program) {
      this.gl.deleteProgram(this.program);
    }

    this.gl = null;
    this.canvas = null;
  }
}

export { WebGLRenderer as default };
