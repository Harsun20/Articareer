export type ParsedResume={text:string;pages:number};
export async function parsePdf(buffer:Buffer):Promise<ParsedResume>{const parser=(await import("pdf-parse")).default;const result=await parser(buffer);return{text:result.text,pages:result.numpages};}
