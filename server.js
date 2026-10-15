const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));
app.get('/health', (_req, res) => res.json({ ok: true }));

const events = new Map();
const socketToEvent = new Map();
const makePin = () => String(100000 + Math.floor(Math.random() * 900000));
const clean = (s, n=120) => String(s || '').trim().slice(0,n);
function publicEvent(e) {
  return { pin:e.pin, title:e.title, status:e.status, questions:e.questions.map((q,i)=>({index:i,text:q.text,options:q.options,seconds:q.seconds})), current:e.current, timeLeft:e.timeLeft, participants:e.participants.size, leaderboard:[...e.participants.values()].map(p=>({name:p.name,score:p.score,answered:p.answers.size})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,10), answerCounts:e.answerCounts || [0,0,0,0] };
}
function broadcast(e) { io.to(e.pin).emit('event:update', publicEvent(e)); }
function stopTimer(e) { if (e.timer) clearInterval(e.timer); e.timer = null; }
function startTimer(e) {
  stopTimer(e); const q=e.questions[e.current]; if(!q) return;
  e.timeLeft=q.seconds; broadcast(e);
  e.timer=setInterval(()=>{ if(e.status!=='question'){stopTimer(e);return;} e.timeLeft=Math.max(0,e.timeLeft-1); broadcast(e); if(e.timeLeft<=0) closeQuestion(e); },1000);
}
function closeQuestion(e) { stopTimer(e); if(e.status!=='question') return; e.status='reveal'; broadcast(e); }
function csvCell(v) { return '"'+String(v ?? '').replace(/"/g,'""')+'"'; }

io.on('connection', socket => {
  socket.on('host:create', (payload, cb=()=>{}) => {
    const title=clean(payload?.title,100)||'Audience Quiz';
    const questions=(Array.isArray(payload?.questions)?payload.questions:[]).slice(0,50).map(q=>({
      text:clean(q.text,500), options:Array.isArray(q.options)?q.options.slice(0,4).map(o=>clean(o,200)):[], correct:Number(q.correct), seconds:Math.max(5,Math.min(180,Number(q.seconds)||20))
    })).filter(q=>q.text && q.options.length===4 && q.options.every(Boolean) && q.correct>=0 && q.correct<=3);
    if(!questions.length) return cb({ok:false,error:'Add at least one valid question with four options and a correct answer.'});
    let pin; do {pin=makePin();} while(events.has(pin));
    const e={pin,title,questions,status:'lobby',current:0,timeLeft:0,participants:new Map(),hostSocket:socket.id,timer:null,answerCounts:[0,0,0,0]};
    events.set(pin,e); socket.join(pin); socketToEvent.set(socket.id,pin); cb({ok:true,pin}); broadcast(e);
  });
  socket.on('host:resume', (pin,cb=()=>{})=>{const e=events.get(clean(pin,6)); if(!e) return cb({ok:false,error:'Event not found.'}); e.hostSocket=socket.id; socket.join(e.pin); socketToEvent.set(socket.id,e.pin); cb({ok:true,event:publicEvent(e)}); broadcast(e);});
  socket.on('participant:join', (payload,cb=()=>{})=>{
    const pin=clean(payload?.pin,6); const e=events.get(pin); const name=clean(payload?.name,80); const email=clean(payload?.email,200).toLowerCase();
    if(!e) return cb({ok:false,error:'That event PIN was not found.'});
    if(!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return cb({ok:false,error:'Enter your name and a valid email address.'});
    let p=[...e.participants.values()].find(x=>x.email===email);
    if(!p) { p={id:crypto.randomUUID(),name,email,score:0,answers:new Map(),socketId:socket.id}; e.participants.set(p.id,p); }
    p.socketId=socket.id; p.name=name; socket.join(pin); socketToEvent.set(socket.id,pin); socket.data.participantId=p.id;
    cb({ok:true,participantId:p.id,event:publicEvent(e)}); broadcast(e); sendQuestionToParticipant(socket,e,p);
  });
  socket.on('participant:answer', (payload,cb=()=>{})=>{
    const pin=socketToEvent.get(socket.id), e=events.get(pin); if(!e || e.status!=='question') return cb({ok:false,error:'The question is not accepting answers.'});
    const p=e.participants.get(socket.data.participantId); if(!p) return cb({ok:false,error:'Please rejoin the event.'});
    const idx=Number(payload?.option), q=e.questions[e.current]; if(!Number.isInteger(idx)||idx<0||idx>3) return cb({ok:false,error:'Invalid answer.'});
    if(p.answers.has(e.current)) return cb({ok:false,error:'Your answer is already locked.'});
    const correct=idx===q.correct; const points=correct?Math.max(100,1000+e.timeLeft*10):0; p.answers.set(e.current,{option:idx,correct,points}); p.score+=points; e.answerCounts[idx]++; cb({ok:true,correct,points}); broadcast(e);
  });
  socket.on('host:start', (pin,cb=()=>{})=>{const e=events.get(clean(pin,6)); if(!e||e.hostSocket!==socket.id)return cb({ok:false,error:'Host session not found.'}); e.current=0;e.status='question';e.answerCounts=[0,0,0,0];startTimer(e);io.to(e.pin).emit('question:show',{index:e.current,text:e.questions[e.current].text,options:e.questions[e.current].options,seconds:e.questions[e.current].seconds});cb({ok:true});});
  socket.on('host:next', (pin,cb=()=>{})=>{const e=events.get(clean(pin,6));if(!e||e.hostSocket!==socket.id)return cb({ok:false,error:'Host session not found.'}); if(e.status==='question')closeQuestion(e); if(e.current+1>=e.questions.length){e.status='finished';stopTimer(e);broadcast(e);io.to(e.pin).emit('event:finished');return cb({ok:true,finished:true});} e.current++;e.answerCounts=[0,0,0,0];e.status='question';startTimer(e);io.to(e.pin).emit('question:show',{index:e.current,text:e.questions[e.current].text,options:e.questions[e.current].options,seconds:e.questions[e.current].seconds});cb({ok:true});});
  socket.on('host:reveal', (pin,cb=()=>{})=>{const e=events.get(clean(pin,6));if(!e||e.hostSocket!==socket.id)return cb({ok:false,error:'Host session not found.'});closeQuestion(e);io.to(e.pin).emit('answer:reveal',{correct:e.questions[e.current].correct});cb({ok:true});});
  socket.on('host:export', (pin,cb=()=>{})=>{const e=events.get(clean(pin,6));if(!e||e.hostSocket!==socket.id)return cb({ok:false,error:'Host session not found.'}); const rows=[['Name','Email','Score',...e.questions.map((q,i)=>`Q${i+1}: ${q.text}`)]];for(const p of e.participants.values()) rows.push([p.name,p.email,p.score,...e.questions.map((q,i)=>{const a=p.answers.get(i);return a?`${q.options[a.option]}${a.correct?' (Correct)':' (Incorrect)'}`:'No answer';})]);cb({ok:true,csv:'\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')});});
  socket.on('disconnect',()=>{socketToEvent.delete(socket.id);});
});
function sendQuestionToParticipant(socket,e,p){ if(e.status==='question'&&e.questions[e.current]){const q=e.questions[e.current];socket.emit('question:show',{index:e.current,text:q.text,options:q.options,seconds:e.timeLeft,alreadyAnswered:p.answers.has(e.current)});} else if(e.status==='finished')socket.emit('event:finished'); else socket.emit('event:waiting',{title:e.title,status:e.status}); }
server.listen(PORT,'0.0.0.0',()=>console.log(`Live Quiz running on http://localhost:${PORT}`));
