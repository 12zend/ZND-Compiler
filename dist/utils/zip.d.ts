declare module 'pako' {
    function inflate(data: Uint8Array): Uint8Array;
}
export declare function unzip(buffer: ArrayBuffer): Promise<{
    files: {
        name: string;
        content: ArrayBuffer | string;
    }[];
}>;
export declare function zip(files: {
    name: string;
    content: string | ArrayBuffer;
}[]): ArrayBuffer;
//# sourceMappingURL=zip.d.ts.map