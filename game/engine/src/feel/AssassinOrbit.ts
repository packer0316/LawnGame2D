/** Milliseconds and local world coordinates; the launch velocity is the ellipse tangent. */
export const STORM_ORBIT={count:6,firstMs:340,periodMs:1440,flightMs:620,radius:76,squash:.72,releaseAngle:-Math.PI/2+.4,distance:380} as const;
export const stormLaunchMs=(index:number)=>STORM_ORBIT.firstMs+index*STORM_ORBIT.periodMs/STORM_ORBIT.count;

export function stormBladePose(index:number,elapsed:number,facing:1|-1){
  const c=STORM_ORBIT,launch=stormLaunchMs(index),flight=elapsed-launch;
  const theta=c.releaseAngle+(elapsed-launch)*Math.PI*2/c.periodMs;
  const vx=-Math.sin(c.releaseAngle),vy=Math.cos(c.releaseAngle)*c.squash;
  const length=Math.hypot(vx,vy),tx=vx/length,ty=vy/length;
  const deployed=Math.min(1,Math.max(0,elapsed/240));
  if(flight<0){
    const radius=c.radius*(.25+.75*(1-Math.pow(1-deployed,3)));
    return {x:facing*Math.cos(theta)*radius,y:Math.sin(theta)*radius*c.squash,alpha:deployed,flying:false,done:false,angle:Math.atan2(ty,facing*tx)};
  }
  // Preserve orbital speed at detachment, then accelerate along the same straight tangent.
  const initialSpeed=c.radius*Math.PI*2/c.periodMs*length;
  const acceleration=2*(c.distance-initialSpeed*c.flightMs)/(c.flightMs*c.flightMs);
  const distance=initialSpeed*flight+.5*acceleration*flight*flight;
  return {x:facing*(Math.cos(c.releaseAngle)*c.radius+tx*distance),y:Math.sin(c.releaseAngle)*c.radius*c.squash+ty*distance,
    alpha:Math.max(0,Math.min(1,(c.flightMs-flight)/120)),flying:true,done:flight>=c.flightMs,angle:Math.atan2(ty,facing*tx)};
}
