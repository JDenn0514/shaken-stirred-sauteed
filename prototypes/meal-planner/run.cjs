const fs=require('fs');
eval(fs.readFileSync(__dirname+'/planner.js','utf8')+fs.readFileSync(__dirname+'/library.js','utf8')+';global.Planner=Planner;global.LIB=LIB;');
const fmt=m=>`+${Math.floor(m/60)}:${String(Math.round(m%60)).padStart(2,'0')}`;
function show(name,dishes,choices){
  const p=Planner.plan(Planner.buildMeal(LIB,dishes,choices||{}));
  console.log(`\n=== ${name}: serve at ${fmt(p.serve)} late=${p.late} ok=${p.ok}`);
  for(const r of p.rows) console.log(fmt(r.start).padStart(6), (r.recipe.title).padEnd(24), r.skipped?'(skip) ':'', r.step.text, r.step.wait&&!r.skipped?`[then ${r.step.wait}m${r.step.watch?' watching':''}]`:'', r.reason?` <- ${r.reason}`:'', r.note?` <- ${r.note}`:'');
}
show('Steak dinner',['steak','asparagus','applesauce','potatoes']);
show('Steak dinner + garlic paste',['steak','asparagus','applesauce','potatoes'],{'potatoes/Garlic paste':'garlic'});
show('Pavlova',['pavlova']);
show('Pavlova, curd on hand, plain cream',['pavlova'],{'pavlova/Lemon curd':'have','pavlova/Whipped cream':'cream'});
show('Everything',['steak','asparagus','applesauce','potatoes','pavlova']);
