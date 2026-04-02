import type { PenState, SpriteInstance } from '../core/ExecutionEngine';

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

export class WebGLRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private context2d: CanvasRenderingContext2D | null = null;
  private penCanvas: HTMLCanvasElement | null = null;
  private penContext: CanvasRenderingContext2D | null = null;
  private penTexture: WebGLTexture | null = null;
  private penTextureDirty: boolean = true;
  private program: WebGLProgram | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private projectionMatrix: Float32Array = new Float32Array(16);
  private textures: Map<string, WebGLTexture> = new Map();
  private currentTexture: WebGLTexture | null = null;
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
    this.penCanvas = document.createElement('canvas');
    this.penCanvas.width = canvas.width;
    this.penCanvas.height = canvas.height;
    this.penContext = this.penCanvas.getContext('2d');

    if (this.penContext) {
      this.penContext.lineCap = 'round';
      this.penContext.lineJoin = 'round';
      this.penContext.imageSmoothingEnabled = true;
    }

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    });

    if (!gl) {
      this.context2d = canvas.getContext('2d');
      if (this.context2d) {
        this.context2d.imageSmoothingEnabled = true;
      }
      this.gpuAvailable = false;
      return;
    }

    this.gl = gl;
    this.gpuAvailable = true;

    this.program = this.createProgram(VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    if (!this.program) {
      this.gpuAvailable = false;
      this.gl = null;
      this.context2d = canvas.getContext('2d');
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

    this.penTexture = gl.createTexture();
    if (this.penTexture) {
      gl.bindTexture(gl.TEXTURE_2D, this.penTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    this.setupProjection();
  }

  clear(): void {
    this.frameCount++;

    if (this.gl && this.canvas) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.gl.clearColor(1, 1, 1, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
      return;
    }

    if (!this.context2d || !this.canvas) {
      return;
    }

    this.context2d.setTransform(1, 0, 0, 1, 0, 0);
    this.context2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context2d.fillStyle = '#ffffff';
    this.context2d.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  renderSprite(sprite: SpriteInstance): void {
    if (!sprite.visible) {
      return;
    }

    if (this.gpuAvailable) {
      this.renderSpriteGPU(sprite);
      return;
    }

    this.renderSpriteCPU(sprite);
  }

  renderPenLayer(): void {
    if (!this.penCanvas || !this.canvas) {
      return;
    }

    if (this.gl) {
      if (!this.penTexture) {
        return;
      }

      if (this.penTextureDirty) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.penTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.penCanvas);
        this.penTextureDirty = false;
      }

      this.drawTexture(this.penTexture, this.canvas.width / 2, this.canvas.height / 2, this.canvas.width, this.canvas.height, 0, 1, [0, 0, 0, 0]);
      return;
    }

    if (this.context2d) {
      this.context2d.drawImage(this.penCanvas, 0, 0);
    }
  }

  clearPenLayer(): void {
    if (!this.penCanvas || !this.penContext) {
      return;
    }

    this.penContext.clearRect(0, 0, this.penCanvas.width, this.penCanvas.height);
    this.penTextureDirty = true;
  }

  drawPenLine(fromX: number, fromY: number, toX: number, toY: number, pen: PenState): void {
    if (!this.penContext || !this.penCanvas) {
      return;
    }

    const [startX, startY] = this.scratchToCanvas(fromX, fromY);
    const [endX, endY] = this.scratchToCanvas(toX, toY);

    this.penContext.strokeStyle = `hsla(${normalizeHue(pen.hue)}, ${clamp(pen.saturation, 0, 100)}%, ${clamp(pen.lightness, 0, 100)}%, ${1 - clamp(pen.transparency, 0, 100) / 100})`;
    this.penContext.lineWidth = Math.max(1, pen.size);
    this.penContext.beginPath();
    this.penContext.moveTo(startX, startY);
    this.penContext.lineTo(endX, endY);
    this.penContext.stroke();
    this.penTextureDirty = true;
  }

  stampSprite(sprite: SpriteInstance): void {
    if (!this.penContext) {
      return;
    }

    this.drawSpriteToContext(this.penContext, sprite, 1);
    this.penTextureDirty = true;
  }

  uploadTexture(id: string, image: HTMLImageElement): WebGLTexture | null {
    if (!this.gl) return null;

    const existing = this.textures.get(id);
    if (existing) {
      return existing;
    }

    const texture = this.gl.createTexture();
    if (!texture) {
      return null;
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);

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
    if (!this.canvas) {
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;

    if (this.penCanvas) {
      this.penCanvas.width = width;
      this.penCanvas.height = height;
      this.penTextureDirty = true;
    }

    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
      if (this.penTexture) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.penTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
      }
      this.setupProjection();
    }
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

    if (this.textures.size > 100 && this.gl) {
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
    if (this.gl) {
      for (const texture of this.textures.values()) {
        this.gl.deleteTexture(texture);
      }
      this.textures.clear();

      if (this.penTexture) {
        this.gl.deleteTexture(this.penTexture);
      }

      if (this.quadBuffer) {
        this.gl.deleteBuffer(this.quadBuffer);
      }

      if (this.program) {
        this.gl.deleteProgram(this.program);
      }
    }

    this.gl = null;
    this.context2d = null;
    this.canvas = null;
    this.penCanvas = null;
    this.penContext = null;
    this.penTexture = null;
  }

  private renderSpriteGPU(sprite: SpriteInstance): void {
    const costume = sprite.getCurrentCostume();
    if (!costume || !this.canvas) {
      return;
    }

    const texture = this.uploadTexture(costume.assetRef, costume.image);
    if (!texture) {
      return;
    }

    const logicalWidth = costume.width / (costume.bitmapResolution || 1);
    const logicalHeight = costume.height / (costume.bitmapResolution || 1);
    const scale = sprite.size / 100;
    const drawWidth = logicalWidth * scale;
    const drawHeight = logicalHeight * scale;

    const [rotation, scaleX] = this.getSpriteTransform(sprite);
    const rotationCenterX = costume.rotationCenterX * scale;
    const rotationCenterY = costume.rotationCenterY * scale;
    const offsetX = (drawWidth / 2 - rotationCenterX) * scaleX;
    const offsetY = drawHeight / 2 - rotationCenterY;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const [anchorX, anchorY] = this.scratchToCanvas(sprite.x, sprite.y);
    const x = anchorX + offsetX * cos - offsetY * sin;
    const y = anchorY + offsetX * sin + offsetY * cos;

    this.drawTexture(texture, x, y, drawWidth, drawHeight, rotation, 1, this.calculateEffectColors(sprite.effects), scaleX);
  }

  private renderSpriteCPU(sprite: SpriteInstance): void {
    if (!this.context2d) {
      return;
    }
    this.drawSpriteToContext(this.context2d, sprite, 1);
  }

  private drawSpriteToContext(
    context: CanvasRenderingContext2D,
    sprite: SpriteInstance,
    alphaMultiplier: number
  ): void {
    const costume = sprite.getCurrentCostume();
    if (!costume) {
      return;
    }

    const scale = sprite.size / 100;
    const drawWidth = (costume.width / (costume.bitmapResolution || 1)) * scale;
    const drawHeight = (costume.height / (costume.bitmapResolution || 1)) * scale;
    const rotationCenterX = costume.rotationCenterX * scale;
    const rotationCenterY = costume.rotationCenterY * scale;
    const [canvasX, canvasY] = this.scratchToCanvas(sprite.x, sprite.y);
    const [rotation, scaleX] = this.getSpriteTransform(sprite);

    context.save();
    context.globalAlpha = alphaMultiplier * (1 - clamp(sprite.effects.ghost || 0, 0, 100) / 100);
    context.translate(canvasX, canvasY);
    context.rotate(rotation);
    context.scale(scaleX, 1);
    context.drawImage(
      costume.image,
      -rotationCenterX,
      -rotationCenterY,
      drawWidth,
      drawHeight
    );
    context.restore();
  }

  private drawTexture(
    texture: WebGLTexture,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    alpha: number,
    colorMix: [number, number, number, number],
    scaleX: number = 1
  ): void {
    if (!this.gl || !this.program || !this.canvas || !this.quadBuffer) {
      return;
    }

    this.gl.useProgram(this.program);
    this.gl.uniformMatrix4fv(this.projectionLocation, false, this.projectionMatrix);
    this.gl.uniform1f(this.alphaLocation, alpha);
    this.gl.uniform4f(this.colorMixLocation, colorMix[0], colorMix[1], colorMix[2], colorMix[3]);

    const halfWidth = (width / 2) * scaleX;
    const halfHeight = height / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const transformMatrix = new Float32Array([
      halfWidth * cos, halfWidth * sin, 0, 0,
      -halfHeight * sin, halfHeight * cos, 0, 0,
      0, 0, 1, 0,
      x, y, 0, 1
    ]);

    this.gl.uniformMatrix4fv(this.transformLocation, false, transformMatrix);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.currentTexture = texture;
    this.gl.uniform1i(this.textureLocation, 0);

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.enableVertexAttribArray(this.positionLocation);
    this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(this.texCoordLocation);
    this.gl.vertexAttribPointer(this.texCoordLocation, 2, this.gl.FLOAT, false, 16, 8);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  private calculateEffectColors(effects: Record<string, number>): [number, number, number, number] {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

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
      a = clamp(effects.ghost / 100, 0, 1);
    }

    return [r, g, b, a];
  }

  private setupProjection(): void {
    if (!this.canvas) {
      return;
    }

    this.projectionMatrix = new Float32Array([
      2 / this.canvas.width, 0, 0, 0,
      0, -2 / this.canvas.height, 0, 0,
      0, 0, 1, 0,
      -1, 1, 0, 1
    ]);
  }

  private scratchToCanvas(x: number, y: number): [number, number] {
    if (!this.canvas) {
      return [x, y];
    }
    return [
      this.canvas.width / 2 + x,
      this.canvas.height / 2 - y
    ];
  }

  private getSpriteTransform(sprite: SpriteInstance): [number, number] {
    if (sprite.isStage) {
      return [0, 1];
    }

    if (sprite.rotationStyle === 'left-right') {
      return [0, sprite.direction < 0 ? -1 : 1];
    }

    if (sprite.rotationStyle === 'don\'t rotate') {
      return [0, 1];
    }

    return [(sprite.direction - 90) * (Math.PI / 180), 1];
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
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHue(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export { WebGLRenderer as default };
