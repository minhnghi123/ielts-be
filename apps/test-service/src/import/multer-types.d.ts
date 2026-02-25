// Minimal type declarations for multer, until @types/multer installs
declare namespace Express {
    namespace Multer {
        interface File {
            fieldname: string;
            originalname: string;
            encoding: string;
            mimetype: string;
            size: number;
            destination: string;
            filename: string;
            path: string;
            buffer: Buffer;
            stream: NodeJS.ReadableStream;
        }
    }

    interface Request {
        file?: Multer.File;
        files?: Multer.File[] | { [fieldname: string]: Multer.File[] };
    }
}
