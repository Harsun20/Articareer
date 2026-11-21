/** Reject cross-site browser mutations; API routes still perform their own auth and ownership checks. */
export function hasSameOrigin(request:Request){
  const origin=request.headers.get("origin");
  if(!origin)return false;
  try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}
}
