export type Edge = readonly [number, number];
export type KnowledgeNode = {
  id: number; name: string; position: readonly [number, number, number];
  radius: number; masteredAt: number; learnFrom?: number;
};
export type Disclosure = {state: 'lit' | 'frontier' | 'locked'; title: string};

const topics = [
  '实数','集合','映射','函数','数列','极限','连续性','变化率','导数',
  '求导法则','链式法则','复合函数','高阶导数','隐函数','参数方程','微分',
  '单调性','极值','凹凸性','拐点','中值定理','泰勒展开','不定积分','定积分',
  '积分换元','分部积分','面积','弧长','广义积分','微分方程','向量','矩阵',
  '线性变换','行列式','特征值','特征向量','内积','正交性','概率空间','随机变量',
  '分布函数','数学期望','方差','条件概率','贝叶斯公式','大数定律','中心极限定理',
  '梯度','偏导数','多重积分','曲线积分','优化方法',
];

// Fibonacci placement covers a 3D shell. A wider horizontal scale fits the
// video frame while retaining real Z depth and perspective parallax.
export const knowledgeNodes: KnowledgeNode[] = topics.map((name, id) => {
  const y = 1 - 2 * (id + 0.5) / topics.length;
  const ring = Math.sqrt(1 - y*y);
  const angle = id * Math.PI * (3 - Math.sqrt(5));
  return {
    id, name, position: [Math.cos(angle)*ring*6.9, y*3.15, Math.sin(angle)*ring*3.4],
    radius: id===8 ? 0.43 : id===9 ? 0.38 : id===10 ? 0.34 : 0.19 + (id%4)*0.035,
    masteredAt: id<9 ? 0 : id===9 ? 230 : id===10 ? 378 : Infinity,
    ...(id===9 ? {learnFrom:85} : id===10 ? {learnFrom:255} : {}),
  };
});

const distance = (a: KnowledgeNode, b: KnowledgeNode) =>
  Math.hypot(...a.position.map((value,axis)=>value-b.position[axis]));

function buildEdges(): Edge[] {
  const edges = new Map<string, Edge>();
  const connect = (a: number, b: number) => {
    const pair: Edge = a < b ? [a,b] : [b,a]; edges.set(pair.join(':'),pair);
  };
  // A minimum spanning backbone keeps all topics connected with short edges.
  const visited = new Set([0]);
  while(visited.size < knowledgeNodes.length){
    let best: Edge = [0,0]; let nearest = Infinity;
    for(const a of visited) for(const b of knowledgeNodes){
      if(visited.has(b.id))continue;
      const length=distance(knowledgeNodes[a],b);
      if(length<nearest){nearest=length;best=[a,b.id];}
    }
    connect(...best); visited.add(best[1]);
  }
  for(const node of knowledgeNodes){
    knowledgeNodes.filter(other=>other.id!==node.id)
      .sort((a,b)=>distance(node,a)-distance(node,b)).slice(0,3)
      .forEach(other=>connect(node.id,other.id));
  }
  // Both narrated learning steps are accessible from the already-lit derivative.
  connect(8,9); connect(8,10); connect(9,11); connect(10,12);
  return [...edges.values()];
}
export const knowledgeEdges = buildEdges();

/** Reveal exactly one hop from lit nodes. Grey nodes never recursively reveal
 * their own neighbours; that next layer stays "???" until another node lights. */
export function disclose(names: readonly string[], edges: readonly Edge[], lit: ReadonlySet<number>): Disclosure[] {
  const frontier = new Set<number>();
  for(const [a,b] of edges){
    if(lit.has(a))frontier.add(b); if(lit.has(b))frontier.add(a);
  }
  return names.map((name,id)=> lit.has(id) ? {state:'lit',title:name}
    : frontier.has(id) ? {state:'frontier',title:name} : {state:'locked',title:'???'});
}
export const getLitNodes = (frame: number) =>
  new Set(knowledgeNodes.filter(node=>frame>=node.masteredAt).map(node=>node.id));
export const getDisclosure = (frame: number) =>
  disclose(knowledgeNodes.map(node=>node.name),knowledgeEdges,getLitNodes(frame));

export function learningProgress(node: KnowledgeNode, frame: number): number {
  if(frame>=node.masteredAt)return 1;
  if(node.learnFrom===undefined || frame<node.learnFrom)return 0;
  const t=Math.min(1,(frame-node.learnFrom)/(node.masteredAt-node.learnFrom));
  return t*t*(3-2*t);
}
