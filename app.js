const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const C=window.APP_CONFIG||{};
const COURSES={
  chinese1:{label:'소형1',defaultName:'중국어1',type:'chinese',prefix:'c1',slot:'small1'},
  chinese2:{label:'소형2',defaultName:'중국어2',type:'chinese',prefix:'c2',slot:'small2'},
  large1:{label:'대형1',defaultName:'대형1',type:'large',slot:'large1'},
  large2:{label:'대형2',defaultName:'대형2',type:'large',slot:'large2'}
};
let sb=null, selectedStudentCourse='chinese1', student=null, studentToken=null;
let semesters=[], teacherSemesterId=null, teacherCourse='chinese1', currentTeacherTab='semester';
let courseNames={chinese1:'중국어1',chinese2:'중국어2',large1:'대형1',large2:'대형2'}, homeworkQrTimer=null, draftTimer=null, largeExamAccessCode='';
const configured=C.SUPABASE_URL&&!String(C.SUPABASE_URL).startsWith('PASTE_')&&C.SUPABASE_PUBLISHABLE_KEY&&!String(C.SUPABASE_PUBLISHABLE_KEY).startsWith('PASTE_');
if(configured) sb=supabase.createClient(C.SUPABASE_URL,C.SUPABASE_PUBLISHABLE_KEY); else $('#setupNotice').classList.remove('hidden');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=2)=>{const x=Number(n??0);return Number.isFinite(x)?x.toFixed(d):Number(0).toFixed(d)};
const fmtDT=v=>{if(!v)return '-';try{return new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}catch{return String(v)}};
const course=key=>COURSES[key]||COURSES.chinese1;
const isChinese=key=>course(key).type==='chinese';
const cPrefix=key=>course(key).prefix;
const selectedSemester=()=>semesters.find(x=>Number(x.id)===Number(teacherSemesterId))||semesters[0];
const weekOpts=(selected=1)=>Array.from({length:15},(_,i)=>`<option value="${i+1}" ${i+1===Number(selected)?'selected':''}>${i+1}주차</option>`).join('');
function msg(el,t,ok=false){if(!el)return;el.textContent=t;el.className=ok?'ok':'bad'}
function clearMsg(el){if(el){el.textContent='';el.className='muted'}}
function setMode(m){$('#studentSection').classList.toggle('hidden',m!=='s');$('#teacherSection').classList.toggle('hidden',m!=='t');$('#studentMode').classList.toggle('active',m==='s');$('#teacherMode').classList.toggle('active',m==='t');if(m==='t')tryRestoreTeacher()}
$('#studentMode').onclick=()=>setMode('s');$('#teacherMode').onclick=()=>setMode('t');
function baseUrl(){return new URL(location.origin+location.pathname)}
function courseLabel(key){return courseNames[key]||course(key).defaultName||course(key).label}
function courseDisplayText(key){const slot=course(key).label,actual=courseLabel(key);return actual&&actual!==slot?`${slot} · ${actual}`:slot}
function setStudentCourse(key){if(!COURSES[key])return;selectedStudentCourse=key;$$('#studentCoursePick button').forEach(b=>b.classList.toggle('active',b.dataset.course===key));$('#loginMsg').textContent=`${courseDisplayText(key)} 학생 로그인`;}
$$('#studentCoursePick button').forEach(b=>b.onclick=()=>setStudentCourse(b.dataset.course));

async function loadPublicInfo(){
  if(!sb)return;
  const [semr,smr,lgr]=await Promise.all([
    sb.rpc('c1_get_active_semester'),
    sb.rpc('sm_get_active_course_names'),
    sb.rpc('lg_get_active_course_names')
  ]);
  const sem=semr.data,sm=smr.data,lg=lgr.data;
  courseNames.chinese1=sm?.ok?(sm.small1||'중국어1'):'중국어1';
  courseNames.chinese2=sm?.ok?(sm.small2||'중국어2'):'중국어2';
  courseNames.large1=lg?.ok?(lg.large1||'대형1'):'대형1';
  courseNames.large2=lg?.ok?(lg.large2||'대형2'):'대형2';
  $$('#studentCoursePick button').forEach(b=>{b.textContent=courseDisplayText(b.dataset.course)});
  $('#publicSemesterLabel').textContent=sem?.ok?`${sem.name} · 4과목 통합관리`:'활성 학기가 없습니다.';
}

// ---------------- 학생 ----------------
function studentStoreKey(key){return `class_student_v4_${key}`}
function saveStudentSession(){if(student&&studentToken)localStorage.setItem(studentStoreKey(student.course),JSON.stringify({student,token:studentToken}))}
function clearStudentSession(key=student?.course||selectedStudentCourse){localStorage.removeItem(studentStoreKey(key));if(key==='chinese1')localStorage.removeItem('c1_student_v2');student=null;studentToken=null}
async function restoreStudent(key){
  if(!sb||!COURSES[key])return;
  let x=null;try{x=JSON.parse(localStorage.getItem(studentStoreKey(key))||'null')}catch{}
  if(!x&&key==='chinese1'){try{x=JSON.parse(localStorage.getItem('c1_student_v2')||'null')}catch{}}
  if(!x?.token)return;
  const rpc=isChinese(key)?`${cPrefix(key)}_student_me`:'lg_student_me';
  const {data,error}=await sb.rpc(rpc,{p_token:x.token});
  if(!error&&data?.ok){student={id:data.id,login_no:data.login_no,student_no:data.student_no,name:data.name,semester_id:data.semester_id,semester_name:data.semester_name,course:key,course_name:data.course_name||courseLabel(key)};studentToken=x.token;saveStudentSession();openStudentApp()}else clearStudentSession(key);
}
function switchStudentTab(tab){$$('#stabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));$$('.spane').forEach(x=>x.classList.add('hidden'));const p=$('#'+tab+'Pane');if(p)p.classList.remove('hidden');if(tab==='scores')renderStudentScores();if(tab==='pledge')renderStudentPledge();}
async function renderStudentGroup(){
  const box=$('#studentGroupCard');if(!box)return;
  if(!studentToken||isChinese(student.course)){box.classList.add('hidden');box.innerHTML='';return}
  box.classList.remove('hidden');box.innerHTML='<div class="muted">조 번호 확인 중…</div>';
  const {data,error}=await sb.rpc('lg_get_my_group',{p_token:studentToken});
  if(error||!data?.ok){box.innerHTML=`<div class="bad">${esc(data?.message||error?.message||'조 번호를 불러오지 못했습니다.')}</div>`;return}
  const g=data.group_no??'';
  box.innerHTML=`<div class="row"><div><b>내 조 번호</b><div class="muted">자신이 속한 조 번호를 입력하고 저장하세요. 잘못 입력했으면 다시 저장하여 수정할 수 있습니다.</div></div><div class="toolbar"><label style="min-width:140px">조 번호<input id="myGroupNo" type="number" min="1" max="99" step="1" value="${g}" placeholder="예: 3"></label><button id="saveMyGroup" class="primary">조 번호 저장</button></div></div><div id="groupMsg" class="muted" style="margin-top:8px"></div>`;
  $('#saveMyGroup').onclick=async()=>{const v=$('#myGroupNo').value.trim();const n=Number(v);if(!Number.isInteger(n)||n<1||n>99){msg($('#groupMsg'),'조 번호는 1~99 사이의 숫자로 입력하세요.');return}const {data:r,error:e}=await sb.rpc('lg_set_my_group',{p_token:studentToken,p_group_no:n});if(e||!r?.ok){msg($('#groupMsg'),r?.message||e?.message||'저장 실패');return}msg($('#groupMsg'),`${n}조로 저장했습니다.`,true)};
}
function openStudentApp(){
  $('#loginCard').classList.add('hidden');$('#studentApp').classList.remove('hidden');
  $('#who').textContent=`학번 ${student.student_no||'-'} · ${student.name} · ${student.course_name||courseLabel(student.course)} · ${student.semester_name}`;
  $('#sQuizTab').classList.toggle('hidden',!isChinese(student.course));
  $('#sPledgeTab').classList.toggle('hidden',isChinese(student.course));
  renderStudentGroup();
  renderStudentAttendance();
  if(isChinese(student.course))renderChineseQuiz(); else $('#quizPane').innerHTML='';
  renderStudentFinal();renderStudentHomework();if(!isChinese(student.course))renderStudentPledge();renderStudentScores();
  processPendingLinks();
}
$('#loginBtn').onclick=async()=>{
  if(!sb)return;clearMsg($('#loginMsg'));
  const studentNo=$('#sid').value.trim(),name=$('#sname').value.trim(),key=selectedStudentCourse;
  if(!studentNo||!name){msg($('#loginMsg'),'학번과 이름을 입력하세요.');return}
  let r;
  if(isChinese(key))r=await sb.rpc(`${cPrefix(key)}_student_login_v2`,{p_student_no:studentNo,p_name:name});
  else r=await sb.rpc('lg_student_login_v2',{p_slot:course(key).slot,p_student_no:studentNo,p_name:name});
  if(r.error||!r.data?.ok){msg($('#loginMsg'),r.data?.message||r.error?.message||'학번과 이름이 일치하지 않습니다.');return}
  student={id:r.data.id,login_no:r.data.login_no,student_no:r.data.student_no,name:r.data.name,semester_id:r.data.semester_id,semester_name:r.data.semester_name,course:key,course_name:r.data.course_name||courseLabel(key)};studentToken=r.data.token;saveStudentSession();openStudentApp();
};
$('#logoutBtn').onclick=async()=>{if(sb&&studentToken){const rpc=isChinese(student.course)?`${cPrefix(student.course)}_student_logout`:'lg_student_logout';await sb.rpc(rpc,{p_token:studentToken})}clearStudentSession();$('#studentApp').classList.add('hidden');$('#loginCard').classList.remove('hidden')};
$$('#stabs button').forEach(b=>b.onclick=()=>switchStudentTab(b.dataset.tab));

async function renderStudentAttendance(){
  if(!studentToken)return;
  $('#attendancePane').innerHTML=`<div class="card"><h3 class="section-title">출석 단어 입력</h3><div id="week1AutoStudent" class="notice hidden" style="margin-bottom:10px"><b>1주차 자동 출석</b><br>명단이 2주차에 확정되므로 1주차는 모든 과목에서 1·2·3교시가 자동으로 출석 처리됩니다.</div><div class="grid g2"><label>주차<select id="aw">${weekOpts()}</select></label><label>교시<select id="ap"><option value="1">1교시</option><option value="2">2교시</option><option value="3">3교시</option></select></label></div><div id="attGateHint" class="muted" style="margin-top:10px"></div><label style="display:block;margin-top:8px">제시 단어<input id="attword" placeholder="교수자가 출석을 연 뒤 단어 입력" autocomplete="off"></label><button id="attsub" class="primary" style="margin-top:10px">출석 확인</button><div id="attmsg" class="muted" style="margin-top:8px"></div><div class="muted" style="margin-top:6px">※ 서버 저장이 성공한 경우에만 <b>✓ 시작 확인</b> 또는 <b>✓ 종료 확인</b>으로 표시됩니다. 실패하면 입력한 단어는 그대로 남습니다.</div><div id="attweekstatus" style="margin-top:12px"></div></div>`;

  let weekData=[];
  let lastSuccess=null;

  const badge=(label,state,ok)=>{
    let bg='#e5e7eb',fg='#374151',text=`${label} 대기`;
    if(ok){bg='#16a34a';fg='white';text=`✓ ${label} 확인`}
    else if(state==='open'){bg='#16a34a';fg='white';text=`${label} 입력 가능`}
    else if(state==='closed'){bg='#dc2626';fg='white';text=`${label} 마감`}
    return `<button type="button" disabled style="opacity:1;cursor:default;background:${bg};color:${fg};border-color:${bg};min-height:38px;padding:7px 10px">${text}</button>`;
  };

  const drawWeekStatus=()=>{
    const rows=weekData||[];
    $('#attweekstatus').innerHTML=`<div class="grid g3">${rows.map(x=>`
      <div class="q">
        <b>${x.period}교시</b>
        <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap">
          ${badge('시작',x.start_state,x.start_ok)}
          ${badge('종료',x.end_state,x.end_ok)}
        </div>
        <div style="margin-top:8px">현재 상태: <b>${esc(x.status)}</b></div>
        ${x.start_ok?`<div class="muted">시작 확인: ${fmtDT(x.start_checked_at)}</div>`:''}
        ${x.end_ok?`<div class="muted">종료 확인: ${fmtDT(x.end_checked_at)}</div>`:''}
      </div>`).join('')}</div>`;
  };

  const applyMode=(clear=true)=>{
    const auto=Number($('#aw').value)===1;
    $('#week1AutoStudent').classList.toggle('hidden',!auto);
    $('#ap').disabled=auto;$('#attword').disabled=auto;$('#attsub').disabled=auto;
    if(auto){
      $('#attword').value='';
      $('#attGateHint').textContent='1주차는 자동 출석입니다.';
      msg($('#attmsg'),'1주차는 자동 출석 처리되어 단어 입력이 필요하지 않습니다.',true);
    }else if(clear)clearMsg($('#attmsg'));
  };

  const updateSelectedHint=()=>{
    const w=Number($('#aw').value),p=Number($('#ap').value),x=(weekData||[]).find(v=>Number(v.period)===p);
    const hint=$('#attGateHint'),word=$('#attword'),btn=$('#attsub');
    if(w===1)return;
    word.disabled=false;btn.disabled=false;

    if(x?.week_finalized){
      hint.innerHTML='<b style="color:#dc2626">이 주차는 이미 출석 확정되었습니다.</b>';
      word.disabled=true;btn.disabled=true;
      btn.textContent='출석 확정됨';
      btn.style.background='';btn.style.borderColor='';btn.style.color='';
      return;
    }

    const open=[];
    if(x?.start_state==='open'&&!x?.start_ok)open.push('시작');
    if(x?.end_state==='open'&&!x?.end_ok)open.push('종료');

    if(open.length){
      hint.innerHTML=`<b style="color:#15803d">${open.join('·')} 출석 입력 가능</b> · 교수자가 마감하면 더 이상 인정되지 않습니다.`;
      word.placeholder=`현재 ${open.join('·')} 출석 단어 입력`;
    }else if(x?.start_ok&&x?.end_ok){
      hint.innerHTML='<b style="color:#15803d">✓ 이 교시는 시작·종료 출석이 모두 확인되었습니다.</b>';
      word.placeholder='출석 확인 완료';
    }else if(x?.end_state==='closed'){
      hint.innerHTML='<b style="color:#dc2626">이 교시는 출석 입력이 마감되었습니다.</b>';
      word.placeholder='출석 입력 마감';
    }else{
      hint.textContent='교수자가 시작 또는 종료 출석을 연 뒤 단어를 입력하세요.';
      word.placeholder='교수자가 출석을 연 뒤 단어 입력';
    }

    if(lastSuccess&&lastSuccess.week===w&&lastSuccess.period===p){
      btn.textContent=`✓ ${lastSuccess.kind==='start'?'시작':'종료'} 확인`;
      btn.style.background='#16a34a';btn.style.borderColor='#16a34a';btn.style.color='white';
    }else{
      btn.textContent='출석 확인';
      btn.style.background='';btn.style.borderColor='';btn.style.color='';
    }
  };

  const refresh=async(clear=true)=>{
    applyMode(clear);
    const rpc=isChinese(student.course)?`${cPrefix(student.course)}_get_attendance_week_v2`:'lg_get_attendance_week_v2';
    const {data,error}=await sb.rpc(rpc,{p_token:studentToken,p_week:Number($('#aw').value)});
    if(error){
      $('#attweekstatus').innerHTML=`<div class="bad">현재 출석 상태를 불러오지 못했습니다: ${esc(error.message)}</div>`;
      return;
    }
    weekData=data||[];
    drawWeekStatus();
    updateSelectedHint();
  };

  $('#aw').onchange=()=>{lastSuccess=null;refresh(true)};
  $('#ap').onchange=()=>{lastSuccess=null;updateSelectedHint()};
  $('#attword').onfocus=()=>refresh(false);
  $('#attword').oninput=()=>{if(lastSuccess){lastSuccess=null;updateSelectedHint()}};

  $('#attsub').onclick=async()=>{
    if(Number($('#aw').value)===1)return;
    const word=$('#attword').value.trim();
    if(!word){msg($('#attmsg'),'단어를 입력하세요.');return}
    const btn=$('#attsub'),weekEl=$('#aw'),periodEl=$('#ap'),wordEl=$('#attword');
    const oldText=btn.textContent;
    btn.disabled=true;weekEl.disabled=true;periodEl.disabled=true;wordEl.disabled=true;btn.textContent='확인 중…';
    clearMsg($('#attmsg'));
    try{
      const rpc=isChinese(student.course)?`${cPrefix(student.course)}_check_attendance`:'lg_check_attendance';
      const week=Number(weekEl.value),period=Number(periodEl.value);
      const {data,error}=await sb.rpc(rpc,{p_token:studentToken,p_week:week,p_period:period,p_word:word});
      if(error||!data?.ok){
        lastSuccess=null;
        msg($('#attmsg'),`${data?.message||error?.message||'확인 실패'} · 입력한 단어는 지우지 않았습니다.`);
        return;
      }
      wordEl.value='';
      lastSuccess={week,period,kind:data.kind};
      const kind=data.kind==='start'?'시작':'종료';
      msg($('#attmsg'),`✅ ${kind} 출석 확인 완료 · ${fmtDT(data.checked_at)}`,true);
      await refresh(false);
      renderStudentScores();
    }catch(e){
      lastSuccess=null;
      msg($('#attmsg'),`서버 연결에 실패했습니다. 다시 눌러주세요. 입력한 단어는 지우지 않았습니다. (${e?.message||'통신 오류'})`);
    }finally{
      weekEl.disabled=false;periodEl.disabled=false;wordEl.disabled=false;
      applyMode(false);
      if(!lastSuccess)btn.textContent=oldText==='확인 중…'?'출석 확인':oldText;
      updateSelectedHint();
    }
  };
  refresh(true);
}

function questionUI(n,prefix){return Array.from({length:n},(_,i)=>`<div class="q"><b>${i+1}번</b><div class="choices">${['A','B','C','D'].map(c=>`<label class="choice"><input type="radio" name="${prefix}${i}" value="${c}">${c}</label>`).join('')}</div></div>`).join('')}
function collectAnswers(n,prefix){const a=[];for(let i=0;i<n;i++){const c=document.querySelector(`input[name="${prefix}${i}"]:checked`);if(!c)return null;a.push(c.value)}return a}
function mcResult(r,ans){return `<div class="score">${r.score}/${r.total}점</div>${ans.map((a,i)=>`<div>${i+1}번: 선택 ${esc(a)} ${a===r.correct[i]?'✅':`❌ → 정답 <b>${esc(r.correct[i])}</b>`}</div>`).join('')}`}
async function renderChineseQuiz(){
  if(!studentToken||!isChinese(student.course))return;const p=cPrefix(student.course);const {data}=await sb.rpc(`${p}_list_open_quizzes`,{p_token:studentToken});
  $('#quizPane').innerHTML=`<div class="card"><h3 class="section-title">듣기평가</h3>${(data||[]).length?(data||[]).map(q=>`<div class="q"><div class="row"><b>제${q.round}차 · ${q.total}문항</b>${q.submitted?`<span class="ok">제출완료 ${q.score}/${q.total}</span><button data-qresult="${q.id}">정답·오답 보기</button>`:`<button data-q="${q.id}" data-total="${q.total}" class="primary">응시</button>`}</div><div id="qarea${q.id}"></div></div>`).join(''):'<div class="muted">현재 공개된 시험이 없습니다.</div>'}</div>`;
  $('#quizPane').querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>showChineseExam(Number(b.dataset.q),Number(b.dataset.total),false));
  $('#quizPane').querySelectorAll('[data-qresult]').forEach(b=>b.onclick=()=>showChineseQuizResult(Number(b.dataset.qresult)));
}
function showChineseExam(qid,n,isFinal){
  const p=cPrefix(student.course),area=isFinal?$('#finalPane'):$('#qarea'+qid),prefix=isFinal?'f-':`q${qid}-`;
  area.innerHTML=(isFinal?'<div class="card"><h3>기말고사 20문항</h3>':'')+questionUI(n,prefix)+`<button id="submitCurrent" class="primary">최종 제출</button><div id="exammsg" style="margin-top:10px"></div>`+(isFinal?'</div>':'');
  $('#submitCurrent').onclick=async()=>{const ans=collectAnswers(n,prefix);if(!ans){msg($('#exammsg'),'모든 문항에 답하세요.');return}if(!confirm('최종 제출하면 다시 수정할 수 없습니다. 제출할까요?'))return;const r=isFinal?await sb.rpc(`${p}_submit_final`,{p_token:studentToken,p_answers:ans}):await sb.rpc(`${p}_submit_quiz`,{p_token:studentToken,p_quiz_id:qid,p_answers:ans});if(r.error||!r.data?.ok){msg($('#exammsg'),r.data?.message||r.error?.message||'제출 실패');return}area.innerHTML=`<div class="card">${isFinal?`<div><b>30점 환산: ${fmt(r.data.converted)} / 30</b></div>`:''}${mcResult(r.data,ans)}</div>`;renderStudentScores()};
}
async function showChineseQuizResult(qid){const p=cPrefix(student.course),{data,error}=await sb.rpc(`${p}_get_quiz_result`,{p_token:studentToken,p_quiz_id:qid});if(error||!data?.ok)return;$('#qarea'+qid).innerHTML=`<div class="card">${mcResult(data,data.answers)}</div>`}

async function renderStudentFinal(){if(!studentToken)return;if(isChinese(student.course))return renderChineseFinal();return renderLargeFinal();}
async function renderChineseFinal(){const p=cPrefix(student.course),{data}=await sb.rpc(`${p}_get_final_status`,{p_token:studentToken});if(data?.submitted)$('#finalPane').innerHTML=`<div class="card"><h3>기말고사</h3><div class="ok">제출완료 · ${data.score}/20 · ${fmt(data.converted)}/30</div>${mcResult(data,data.answers)}</div>`;else if(data?.open){$('#finalPane').innerHTML='<div class="card"><button id="startFinal" class="primary">기말고사 시작</button></div>';$('#startFinal').onclick=()=>showChineseExam(1,20,true)}else $('#finalPane').innerHTML='<div class="card muted">기말고사가 아직 공개되지 않았습니다.</div>'}
async function renderLargeFinal(){
  clearInterval(draftTimer);draftTimer=null;largeExamAccessCode='';
  const {data,error}=await sb.rpc('lg_get_final_status',{p_token:studentToken});
  if(error||!data?.ok){$('#finalPane').innerHTML='<div class="card bad">기말고사 상태를 확인할 수 없습니다.</div>';return}
  if(data.submitted){$('#finalPane').innerHTML=`<div class="card"><h3 class="section-title">논술형 기말고사</h3><div class="ok">최종 제출 완료</div><div class="muted" style="margin-top:8px">${data.final_score==null?'채점 전입니다.':`현재 반영 점수 ${fmt(data.final_score)} / 30`}</div></div>`;return}
  if(!data.open){$('#finalPane').innerHTML='<div class="card muted">기말고사가 아직 공개되지 않았습니다.</div>';return}
  $('#finalPane').innerHTML=`<div class="card"><h3 class="section-title">논술형 기말고사</h3><div class="notice">노트북으로 답안을 작성합니다. 답안은 임시저장할 수 있고 최종 제출 후에는 수정할 수 없습니다.</div>${data.needs_code?'<label style="display:block;margin-top:12px">시험 접속코드<input id="examAccessCode" autocomplete="off"></label>':''}<button id="openEssay" class="primary" style="margin-top:10px">문제 열기</button><div id="essayStartMsg" class="muted" style="margin-top:8px"></div></div>`;
  $('#openEssay').onclick=()=>{largeExamAccessCode=data.needs_code?$('#examAccessCode').value.trim():'';startLargeEssay()};
}
async function startLargeEssay(){
  const {data,error}=await sb.rpc('lg_get_final_exam',{p_token:studentToken,p_access_code:largeExamAccessCode});
  if(error||!data?.ok){msg($('#essayStartMsg'),data?.message||error?.message||'시험을 열 수 없습니다.');return}
  const qs=data.questions||[],answers=data.answers||{};
  $('#finalPane').innerHTML=`<div class="card essay"><div class="row"><div><h3 class="section-title">논술형 기말고사</h3><div class="muted">전체 ${fmt(qs.reduce((s,q)=>s+Number(q.max_score||0),0),0)}점</div></div><div id="draftStatus" class="muted">답안 작성 중</div></div>${qs.map((q,i)=>`<div class="q"><div class="row"><b>${i+1}. ${esc(q.prompt)}</b><span class="badge">${fmt(q.max_score,0)}점</span></div><textarea data-essay-id="${esc(q.id)}" placeholder="답안을 작성하세요">${esc(answers[q.id]||'')}</textarea><div class="muted right"><span data-count-for="${esc(q.id)}">${String(answers[q.id]||'').length}</span>자</div></div>`).join('')}<div class="row"><button id="saveDraft">임시저장</button><button id="submitEssay" class="primary">최종 제출</button></div><div id="essayMsg" class="muted" style="margin-top:8px"></div></div>`;
  $('#finalPane').querySelectorAll('[data-essay-id]').forEach(t=>t.oninput=()=>{const c=$(`[data-count-for="${CSS.escape(t.dataset.essayId)}"]`);if(c)c.textContent=t.value.length});
  $('#saveDraft').onclick=()=>saveLargeDraft(false);$('#submitEssay').onclick=submitLargeEssay;
  clearInterval(draftTimer);draftTimer=setInterval(()=>saveLargeDraft(true),30000);
}
function collectEssayAnswers(){const o={};$('#finalPane').querySelectorAll('[data-essay-id]').forEach(t=>o[t.dataset.essayId]=t.value);return o}
async function saveLargeDraft(auto=false){const answers=collectEssayAnswers();const {data,error}=await sb.rpc('lg_save_final_draft',{p_token:studentToken,p_access_code:largeExamAccessCode,p_answers:answers});const el=$('#draftStatus')||$('#essayMsg');if(error||!data?.ok){if(!auto)msg(el,data?.message||error?.message||'임시저장 실패');return}if(el){el.textContent=`${auto?'자동':'임시'}저장 완료 ${new Date().toLocaleTimeString()}`;el.className='ok'}}
async function submitLargeEssay(){if(!confirm('최종 제출하면 다시 수정할 수 없습니다. 제출할까요?'))return;const answers=collectEssayAnswers();const {data,error}=await sb.rpc('lg_submit_final',{p_token:studentToken,p_access_code:largeExamAccessCode,p_answers:answers});if(error||!data?.ok){msg($('#essayMsg'),data?.message||error?.message||'제출 실패');return}clearInterval(draftTimer);draftTimer=null;$('#finalPane').innerHTML='<div class="card"><div class="ok">기말고사 답안이 최종 제출되었습니다.</div></div>';renderStudentScores()}

async function renderStudentHomework(){
  if(!studentToken)return;
  if(isChinese(student.course)){
    $('#homeworkPane').innerHTML=`<div class="card"><h3 class="section-title">과제 확인</h3><div class="grid g2"><label>주차<select id="hwweek">${weekOpts()}</select></label><label>QR 인증코드<input id="hwcode"></label></div><button id="hwsub" class="primary" style="margin-top:10px">과제 확인</button><div id="hwmsg" class="muted" style="margin-top:8px"></div></div>`;
    $('#hwsub').onclick=()=>submitChineseHomework(Number($('#hwweek').value),$('#hwcode').value.trim(),$('#hwmsg'));
  }else{
    const {data}=await sb.rpc('lg_get_student_summary',{p_token:studentToken});$('#homeworkPane').innerHTML=`<div class="card"><h3 class="section-title">기말 과제 제출 확인</h3>${data?.homework_done?'<div class="ok">과제 제출 확인 완료 · 20/20</div>':'<div class="muted">기말고사 당일 실물 과제를 교수님께 제출한 뒤, 교수님 휴대폰의 동적 QR을 바로 촬영하세요.</div>'}<div id="hwmsg" class="muted" style="margin-top:8px"></div></div>`;
  }
}
async function submitChineseHomework(week,code,el){const p=cPrefix(student.course),{data,error}=await sb.rpc(`${p}_check_homework`,{p_token:studentToken,p_week:week,p_code:code});if(error||!data?.ok)msg(el,data?.message||error?.message||'실패');else{msg(el,'과제가 확인되었습니다.',true);renderStudentScores()}}
async function renderStudentPledge(){
  const pane=$('#pledgePane');if(!pane||!studentToken)return;
  if(isChinese(student.course)){pane.innerHTML='';return}
  pane.innerHTML='<div class="card">각서 확인 중…</div>';
  const {data,error}=await sb.rpc('lg_get_pledge',{p_token:studentToken});
  if(error){pane.innerHTML=`<div class="card bad">${esc(error.message)}</div>`;return}
  if(!data?.ok){pane.innerHTML=`<div class="card bad">${esc(data?.message||'각서를 불러오지 못했습니다.')}</div>`;return}
  if(!data.available){pane.innerHTML='<div class="card"><h3 class="section-title">각서</h3><div class="muted">현재 학생에게 공개된 각서가 없습니다.</div></div>';return}
  if(data.signed){pane.innerHTML=`<div class="card"><h3 class="section-title">각서</h3><div class="pledgebox">${esc(data.content)}</div><div class="ok" style="margin-top:12px">서명 및 확인 완료</div><div class="muted">버전 ${data.version} · 확인시각 ${new Date(data.confirmed_at).toLocaleString()}</div></div>`;return}
  pane.innerHTML=`<div class="card"><h3 class="section-title">각서</h3><div class="muted">내용을 읽은 뒤 아래에 손가락으로 직접 서명하고 확인 버튼을 누르세요. · 버전 ${data.version}</div><div class="pledgebox" style="margin-top:12px">${esc(data.content)}</div><label class="q" style="display:flex;gap:8px;align-items:flex-start"><input id="pledgeAgree" type="checkbox" style="width:auto;min-height:auto;margin-top:3px"> <span>위 내용을 모두 읽고 확인하였으며 이에 동의합니다.</span></label><div class="signature-wrap"><div class="muted" style="margin-bottom:6px">서명</div><canvas id="signaturePad" class="signature-pad" width="900" height="260"></canvas><div class="row" style="margin-top:8px"><button id="clearSignature">서명 지우기</button><button id="submitPledge" class="primary">서명 및 확인</button></div></div><div id="pledgeMsg" class="muted" style="margin-top:8px"></div></div>`;
  const canvas=$('#signaturePad'),ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#172033';let drawing=false,dirty=false,last=null;
  const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}};
  canvas.onpointerdown=e=>{e.preventDefault();drawing=true;dirty=true;last=point(e);try{canvas.setPointerCapture(e.pointerId)}catch{}};
  canvas.onpointermove=e=>{if(!drawing)return;e.preventDefault();const q=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(q.x,q.y);ctx.stroke();last=q};
  const stop=e=>{drawing=false;last=null;try{canvas.releasePointerCapture(e.pointerId)}catch{}};canvas.onpointerup=stop;canvas.onpointercancel=stop;canvas.onpointerleave=e=>{if(drawing)stop(e)};
  $('#clearSignature').onclick=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);dirty=false;clearMsg($('#pledgeMsg'))};
  $('#submitPledge').onclick=async()=>{if(!$('#pledgeAgree').checked){msg($('#pledgeMsg'),'각서 확인란에 체크하세요.');return}if(!dirty){msg($('#pledgeMsg'),'서명란에 직접 서명하세요.');return}const sig=canvas.toDataURL('image/png');const {data:r,error:e}=await sb.rpc('lg_sign_pledge',{p_token:studentToken,p_version:Number(data.version),p_signature_data:sig});if(e||!r?.ok){msg($('#pledgeMsg'),r?.message||e?.message||'서명 저장 실패');return}msg($('#pledgeMsg'),'서명 및 확인이 완료되었습니다.',true);setTimeout(renderStudentPledge,500)};
}
async function processPendingLinks(){
  const u=new URL(location.href);
  if(isChinese(student.course)){const w=Number(u.searchParams.get('homework_week')),code=u.searchParams.get('code');if(w&&code){switchStudentTab('homework');await renderStudentHomework();if($('#hwweek'))$('#hwweek').value=String(w);if($('#hwcode'))$('#hwcode').value=code;await submitChineseHomework(w,code,$('#hwmsg'));cleanQuery(['homework_week','code']);}}
  else {const tok=u.searchParams.get('hwtoken');if(tok){switchStudentTab('homework');await renderStudentHomework();const {data,error}=await sb.rpc('lg_claim_homework',{p_token:studentToken,p_qr_token:tok});if(error||!data?.ok)msg($('#hwmsg'),data?.message||error?.message||'QR 인증 실패');else{msg($('#hwmsg'),data.already?'이미 과제 제출 확인이 되어 있습니다.':'과제 제출 확인이 완료되었습니다.',true);renderStudentScores()}cleanQuery(['hwtoken']);}}
}
function cleanQuery(keys){const u=new URL(location.href);keys.forEach(k=>u.searchParams.delete(k));history.replaceState({},'',u.pathname+(u.search?u.search:''));}

async function renderStudentScores(){
  if(!studentToken)return;
  if(isChinese(student.course)){
    const p=cPrefix(student.course),{data}=await sb.rpc(`${p}_get_student_summary`,{p_token:studentToken});if(!data?.ok)return;
    $('#scoresPane').innerHTML=`<div class="card"><h3 class="section-title">내 성적</h3><div class="grid g2"><div class="q"><div class="muted">듣기평가 → 중간</div><div class="score">${fmt(data.midterm)} / 30</div><div>${data.quiz_got}/${data.quiz_max}</div></div><div class="q"><div class="muted">출석</div><div class="score">${fmt(data.attendance,3)} / 20</div><div>결석 ${data.absent_periods} · 지각 ${data.late_periods} · 조퇴 ${data.early_periods}</div></div><div class="q"><div class="muted">과제</div><div class="score">${fmt(data.homework_score)} / 20</div><div>${data.homework_done}/${data.homework_total}</div></div><div class="q"><div class="muted">기말고사</div><div class="score">${fmt(data.final_score)} / 30</div><div>원점수 ${data.final_raw}/20</div></div></div><div class="q"><div class="muted">현재 총점</div><div class="score">${fmt(data.total)} / 100</div></div></div>`;
  } else {
    const {data}=await sb.rpc('lg_get_student_summary',{p_token:studentToken});if(!data?.ok)return;
    $('#scoresPane').innerHTML=`<div class="card"><h3 class="section-title">내 성적</h3><div class="grid g2"><div class="q"><div class="muted">중간발표</div><div class="score">${fmt(data.midterm)} / 30</div></div><div class="q"><div class="muted">출석</div><div class="score">${fmt(data.attendance,3)} / 20</div><div>결석 ${data.absent_periods} · 지각 ${data.late_periods} · 조퇴 ${data.early_periods}</div></div><div class="q"><div class="muted">기말 과제</div><div class="score">${fmt(data.homework_score)} / 20</div></div><div class="q"><div class="muted">논술형 기말</div><div class="score">${fmt(data.final_score)} / 30</div><div>${data.final_submitted?'제출 완료':'미제출'}</div></div></div><div class="q"><div class="muted">현재 총점</div><div class="score">${fmt(data.total)} / 100</div></div></div>`;
  }
}

// ---------------- 교수자 ----------------
async function tryRestoreTeacher(){if(!sb)return;const {data}=await sb.auth.getSession();if(data?.session)openTeacherApp();}
$('#teacherLoginBtn').onclick=async()=>{if(!sb)return;const email=$('#temail').value.trim(),password=$('#tpassword').value;const {error}=await sb.auth.signInWithPassword({email,password});if(error){msg($('#teacherMsg'),error.message);return}openTeacherApp()};
$('#teacherLogoutBtn').onclick=async()=>{clearInterval(homeworkQrTimer);homeworkQrTimer=null;await sb.auth.signOut();$('#teacherApp').classList.add('hidden');$('#teacherLogin').classList.remove('hidden')};
async function openTeacherApp(){$('#teacherLogin').classList.add('hidden');$('#teacherApp').classList.remove('hidden');await loadSemesters();applyTeacherCourseTabs();renderTeacherTab(currentTeacherTab)}
async function loadSemesters(){const {data,error}=await sb.from('c1_semesters').select('*').order('id',{ascending:false});if(error){alert(error.message);return}semesters=data||[];const active=semesters.find(x=>x.is_active);if(!teacherSemesterId||!semesters.some(x=>Number(x.id)===Number(teacherSemesterId)))teacherSemesterId=active?.id||semesters[0]?.id||null;$('#semesterSelect').innerHTML=semesters.map(s=>`<option value="${s.id}" ${Number(s.id)===Number(teacherSemesterId)?'selected':''}>${esc(s.name)}${s.is_active?' ★':''}</option>`).join('');updateSemesterBadge();await loadTeacherCourseNames()}
function updateSemesterBadge(){const sem=selectedSemester();$('#semesterBadge').textContent=sem?(sem.is_active?'현재 학생용 활성 학기':'과거/비활성 학기'):''}
$('#semesterSelect').onchange=async()=>{teacherSemesterId=Number($('#semesterSelect').value);updateSemesterBadge();await loadTeacherCourseNames();renderTeacherTab(currentTeacherTab)};
$('#teacherCourseSelect').onchange=async()=>{teacherCourse=$('#teacherCourseSelect').value;clearInterval(homeworkQrTimer);homeworkQrTimer=null;await loadTeacherCourseNames();applyTeacherCourseTabs();if((isChinese(teacherCourse)&&(currentTeacherTab==='midterm'||currentTeacherTab==='pledge'))||(!isChinese(teacherCourse)&&currentTeacherTab==='quiz'))currentTeacherTab='semester';switchTeacherPane(currentTeacherTab);renderTeacherTab(currentTeacherTab)};
async function loadTeacherCourseNames(){
  const sem=selectedSemester();if(!sem)return;
  courseNames.chinese1='중국어1';courseNames.chinese2='중국어2';courseNames.large1='대형1';courseNames.large2='대형2';
  const [smr,lgr]=await Promise.all([
    sb.from('sm_course_settings').select('slot,display_name').eq('semester_id',sem.id),
    sb.from('lg_course_settings').select('slot,display_name').eq('semester_id',sem.id)
  ]);
  (smr.data||[]).forEach(x=>{if(x.slot==='small1')courseNames.chinese1=x.display_name;if(x.slot==='small2')courseNames.chinese2=x.display_name});
  (lgr.data||[]).forEach(x=>{if(x.slot==='large1'||x.slot==='large2')courseNames[x.slot]=x.display_name});
  const sel=$('#teacherCourseSelect');
  [...sel.options].forEach(o=>{o.textContent=courseDisplayText(o.value)});
}
function applyTeacherCourseTabs(){$('#tQuizTab').classList.toggle('hidden',!isChinese(teacherCourse));$('#tMidtermTab').classList.toggle('hidden',isChinese(teacherCourse));$('#tPledgeTab').classList.toggle('hidden',isChinese(teacherCourse))}
function switchTeacherPane(tab){$$('#ttabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));$$('.tpane').forEach(x=>x.classList.add('hidden'));const p=$('#t'+tab);if(p)p.classList.remove('hidden')}
$$('#ttabs button').forEach(b=>b.onclick=()=>{currentTeacherTab=b.dataset.tab;clearInterval(homeworkQrTimer);homeworkQrTimer=null;switchTeacherPane(currentTeacherTab);renderTeacherTab(currentTeacherTab)});
function renderTeacherTab(tab){if(!selectedSemester())return;const map={semester:renderTeacherSemester,qr:renderTeacherQR,attendance:renderTeacherAttendance,quiz:renderTeacherQuiz,midterm:renderTeacherMidterm,final:renderTeacherFinal,homework:renderTeacherHomework,pledge:renderTeacherPledge,grades:renderTeacherGrades};if(map[tab])map[tab]()}

async function getRoster(){
  const sem=selectedSemester();
  if(isChinese(teacherCourse)){
    const p=cPrefix(teacherCourse);
    const {data,error}=await sb.from(`${p}_students`).select('id,login_no,student_no,name').eq('semester_id',sem.id).order('login_no');
    return {data:data||[],error};
  }
  const {data,error}=await sb.from('lg_students').select('id,login_no,student_no,name,group_no').eq('semester_id',sem.id).eq('slot',course(teacherCourse).slot).order('login_no');
  return {data:data||[],error};
}

function parseRosterText(text){
  const out=[];
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();if(!line)continue;
    if(/학번/.test(line)&&/이름/.test(line))continue;
    let student_no='',name='';
    const parts=line.split(/[\t,]/).map(x=>x.trim().replace(/^"|"$/g,'')).filter(Boolean);
    if(parts.length>=2){
      const idx=parts.findIndex(x=>/^\d{7,12}$/.test(x));
      if(idx>=0&&idx<parts.length-1){
        student_no=parts[idx];
        name=parts.slice(idx+1).join(' ').trim();
      }
    }
    if(!student_no){
      const m=line.match(/^\s*(\d{7,12})\s+(.+?)\s*$/);
      if(m){student_no=m[1];name=m[2].trim()}
    }
    if(student_no&&name)out.push({student_no,name});
  }
  return out;
}

async function renderTeacherSemester(){
  const pane=$('#tsemester'),sem=selectedSemester(),{data:roster,error}=await getRoster();
  if(error){pane.innerHTML=`<div class="card bad">${esc(error.message)}</div>`;return}

  const courseNameBlock=`<div class="card"><h3 class="section-title">${esc(course(teacherCourse).label)} 실제 과목명</h3><div class="grid g2"><label>이번 학기 과목명<input id="courseDisplayName" value="${esc(courseLabel(teacherCourse))}"></label><div style="display:flex;align-items:end"><button id="saveCourseName" class="primary">과목명 저장</button></div></div><div class="muted" style="margin-top:8px">프로그램 슬롯은 ${esc(course(teacherCourse).label)}로 유지되고, 실제 과목명은 학기마다 바꿀 수 있습니다.</div></div>`;

  pane.innerHTML=`<div class="card"><div class="row"><div><h3 class="section-title">학기 관리</h3><div class="muted">새 학기를 만들면 소형1·소형2·대형1·대형2가 같은 학기 아래 자동 준비됩니다.</div></div><button id="makeActive" ${sem.is_active?'disabled':''}>${sem.is_active?'현재 활성 학기':'이 학기를 학생용으로 활성화'}</button></div><div class="grid g2" style="margin-top:12px"><label>새 학기 이름<input id="newSemesterName" placeholder="예: 2027-1학기"></label><div style="display:flex;align-items:end"><button id="createSemester" class="primary">새 학기 만들기</button></div></div><div id="semesterMsg" class="muted" style="margin-top:8px"></div></div>
  ${courseNameBlock}
  <div class="card"><div class="row"><div><h3 class="section-title">${esc(courseDisplayText(teacherCourse))} 학생 명단</h3><div class="muted">현재 ${roster.length}명 · 학생 로그인은 <b>학번 + 이름</b>을 사용합니다.</div></div><input id="rosterSearch" style="max-width:280px" placeholder="번호·학번·이름 검색"></div><div id="rosterTable" style="margin-top:10px"></div></div>
  <div class="card"><h3 class="section-title">명단 전체 입력/교체</h3><div class="notice">앞으로 명단은 <b>학번 + 이름</b>으로 입력하세요. 예: <b>202600018,이시은</b>. 2주차 이후 학생 활동 기록이 생기면 안전을 위해 전체교체가 차단됩니다.</div><textarea id="rosterPaste" placeholder="202600018,이시은\n202200002,금성현\n\nCSV의 '고유번호,학번,이름' 형식도 읽을 수 있습니다."></textarea><div class="row"><label style="max-width:340px">TXT/CSV 불러오기<input id="rosterFile" type="file" accept=".txt,.csv,text/plain,text/csv"></label><button id="replaceRoster" class="primary">명단 전체교체</button></div><div id="rosterMsg" class="muted" style="margin-top:8px"></div></div>
  <div class="card"><h3 class="section-title">학생 한 명 추가</h3><div class="grid g3"><label>학번<input id="addStudentNo" inputmode="numeric" placeholder="예: 202600018"></label><label>이름<input id="addName"></label><div style="display:flex;align-items:end"><button id="addStudent" class="primary">학생 추가</button></div></div></div>`;

  const draw=()=>{
    const q=$('#rosterSearch').value.trim();
    const arr=roster.filter(s=>!q||String(s.student_no||'').includes(q)||s.name.includes(q)||(!isChinese(teacherCourse)&&String(s.group_no??'').includes(q)));
    const large=!isChinese(teacherCourse);
    $('#rosterTable').innerHTML=`<div class="tablewrap"><table style="min-width:${large?'690':'580'}px"><thead><tr><th>학번</th><th class="left">이름</th>${large?'<th>조</th>':''}<th>수정</th><th>삭제</th></tr></thead><tbody>${arr.map(s=>`<tr><td><input data-studentno-id="${s.id}" value="${esc(s.student_no||'')}" inputmode="numeric" style="min-width:120px"></td><td class="left"><input data-name-id="${s.id}" value="${esc(s.name)}"></td>${large?`<td><input data-group-id="${s.id}" type="number" min="1" max="99" step="1" value="${s.group_no??''}" placeholder="조" style="max-width:90px"></td>`:''}<td><button class="smallbtn" data-save-student="${s.id}">${large?'학번·이름·조 저장':'학번·이름 저장'}</button></td><td><button class="smallbtn danger" data-delete-student="${s.id}">삭제</button></td></tr>`).join('')}</tbody></table></div>`;

    $('#rosterTable').querySelectorAll('[data-save-student]').forEach(b=>b.onclick=async()=>{
      const id=Number(b.dataset.saveStudent),student_no=$(`[data-studentno-id="${id}"]`).value.trim(),name=$(`[data-name-id="${id}"]`).value.trim();
      if(!student_no||!name){alert('학번과 이름을 입력하세요.');return}
      let r;
      if(isChinese(teacherCourse))r=await sb.from(`${cPrefix(teacherCourse)}_students`).update({student_no,name}).eq('id',id);
      else{
        const raw=$(`[data-group-id="${id}"]`).value.trim();let group_no=null;
        if(raw!==''){group_no=Number(raw);if(!Number.isInteger(group_no)||group_no<1||group_no>99){alert('조 번호는 1~99 사이의 숫자로 입력하세요.');return}}
        r=await sb.from('lg_students').update({student_no,name,group_no}).eq('id',id);
      }
      if(r.error)alert(r.error.message);else renderTeacherSemester();
    });

    $('#rosterTable').querySelectorAll('[data-delete-student]').forEach(b=>b.onclick=async()=>{
      if(!confirm('이 학생을 삭제할까요? 기록이 있으면 삭제되지 않습니다.'))return;
      const id=Number(b.dataset.deleteStudent),rpc=isChinese(teacherCourse)?`${cPrefix(teacherCourse)}_delete_student`:'lg_delete_student';
      const {error}=await sb.rpc(rpc,{p_student_id:id});
      if(error)alert(error.message);else renderTeacherSemester();
    });
  };
  $('#rosterSearch').oninput=draw;draw();

  $('#createSemester').onclick=async()=>{
    const name=$('#newSemesterName').value.trim();if(!name){msg($('#semesterMsg'),'새 학기 이름을 입력하세요.');return}
    const {data,error}=await sb.rpc('c1_create_semester',{p_name:name,p_make_active:false});
    if(error)msg($('#semesterMsg'),error.message);else{msg($('#semesterMsg'),'새 학기를 만들었습니다.',true);await loadSemesters();renderTeacherSemester()}
  };

  $('#makeActive').onclick=async()=>{
    if(!confirm(`${sem.name}을 학생용 활성 학기로 바꿀까요? 기존 학생 로그인 세션은 종료됩니다.`))return;
    const {error}=await sb.rpc('c1_set_active_semester',{p_semester_id:sem.id});
    if(error)alert(error.message);else{await loadSemesters();renderTeacherSemester();loadPublicInfo()}
  };

  $('#saveCourseName').onclick=async()=>{
    const nm=$('#courseDisplayName').value.trim();
    let r;
    if(isChinese(teacherCourse))r=await sb.rpc('sm_set_course_name',{p_semester_id:sem.id,p_slot:course(teacherCourse).slot,p_display_name:nm});
    else r=await sb.rpc('lg_set_course_name',{p_semester_id:sem.id,p_slot:course(teacherCourse).slot,p_display_name:nm});
    if(r.error||r.data?.ok===false)alert(r.data?.message||r.error?.message||'과목명 저장 실패');
    else{courseNames[teacherCourse]=r.data?.display_name||nm||course(teacherCourse).defaultName;await loadTeacherCourseNames();renderTeacherSemester();if(sem.is_active)loadPublicInfo()}
  };

  $('#rosterFile').onchange=async e=>{const f=e.target.files?.[0];if(f)$('#rosterPaste').value=await f.text()};

  $('#replaceRoster').onclick=async()=>{
    const rows=parseRosterText($('#rosterPaste').value);
    if(!rows.length){msg($('#rosterMsg'),'학번과 이름을 읽을 수 없습니다. 예: 202600018,이시은');return}
    if(!confirm(`${rows.length}명으로 전체교체할까요?`))return;
    const p_student_nos=rows.map(x=>x.student_no),p_names=rows.map(x=>x.name);
    let r;
    if(isChinese(teacherCourse))r=await sb.rpc(`${cPrefix(teacherCourse)}_replace_roster_v2`,{p_semester_id:sem.id,p_student_nos,p_names});
    else r=await sb.rpc('lg_replace_roster_v2',{p_semester_id:sem.id,p_slot:course(teacherCourse).slot,p_student_nos,p_names});
    if(r.error||!r.data?.ok){msg($('#rosterMsg'),r.data?.message||r.error?.message||'명단 교체 실패');return}
    msg($('#rosterMsg'),`${r.data.count}명으로 저장했습니다.`,true);renderTeacherSemester();
  };

  $('#addStudent').onclick=async()=>{
    const student_no=$('#addStudentNo').value.trim(),name=$('#addName').value.trim();
    if(!student_no||!name)return alert('학번과 이름을 입력하세요.');
    let r;
    if(isChinese(teacherCourse))r=await sb.rpc(`${cPrefix(teacherCourse)}_add_student_v2`,{p_semester_id:sem.id,p_student_no:student_no,p_name:name});
    else r=await sb.rpc('lg_add_student_v2',{p_semester_id:sem.id,p_slot:course(teacherCourse).slot,p_student_no:student_no,p_name:name});
    if(r.error||!r.data?.ok)alert(r.data?.message||r.error?.message||'학생 추가 실패');else renderTeacherSemester();
  };
}

function renderTeacherQR(){const pane=$('#tqr'),sem=selectedSemester(),url=baseUrl();url.searchParams.set('course',teacherCourse);pane.innerHTML=`<div class="card"><h3 class="section-title">${esc(courseLabel(teacherCourse))} 학생접속 QR</h3><div class="muted">이 QR은 같은 웹주소를 사용합니다. 학생은 QR을 찍으면 ${esc(courseLabel(teacherCourse))}가 자동 선택됩니다.</div><div id="studentQR" class="qrbox" style="margin-top:12px"></div><div class="muted" style="word-break:break-all;margin-top:8px">${esc(url.href)}</div>${sem.is_active?'':'<div class="warn" style="margin-top:8px">현재 선택한 학기는 학생용 활성 학기가 아닙니다.</div>'}</div>`;new QRCode($('#studentQR'),{text:url.href,width:220,height:220})}

async function renderTeacherAttendance(){
  const pane=$('#tattendance'),sem=selectedSemester();
  pane.innerHTML=`<div class="card"><h3 class="section-title">${esc(courseLabel(teacherCourse))} 출석 설정</h3><label style="max-width:220px;display:block">주차<select id="taWeek">${weekOpts()}</select></label><div id="taBody" style="margin-top:10px"></div></div>`;

  const load=async()=>{
    const w=Number($('#taWeek').value);
    let week,words,recs,roster;
    const courseKey=course(teacherCourse).slot;
    if(isChinese(teacherCourse)){
      const p=cPrefix(teacherCourse);
      [{data:week},{data:words},{data:recs},{data:roster}]=await Promise.all([
        sb.from(`${p}_attendance_weeks`).select('*').eq('semester_id',sem.id).eq('week',w).maybeSingle(),
        sb.from(`${p}_attendance_words`).select('*').eq('semester_id',sem.id).eq('week',w).order('period'),
        sb.from(`${p}_attendance_records`).select('*').eq('semester_id',sem.id).eq('week',w),
        sb.from(`${p}_students`).select('id,student_no,name').eq('semester_id',sem.id).order('student_no')
      ]);
    }else{
      const sl=course(teacherCourse).slot;
      [{data:week},{data:words},{data:recs},{data:roster}]=await Promise.all([
        sb.from('lg_attendance_weeks').select('*').eq('semester_id',sem.id).eq('slot',sl).eq('week',w).maybeSingle(),
        sb.from('lg_attendance_words').select('*').eq('semester_id',sem.id).eq('slot',sl).eq('week',w).order('period'),
        sb.from('lg_attendance_records').select('*').eq('semester_id',sem.id).eq('slot',sl).eq('week',w),
        sb.from('lg_students').select('id,student_no,name').eq('semester_id',sem.id).eq('slot',sl).order('student_no')
      ]);
    }

    const ctrlR=await sb.from('attendance_period_controls').select('*').eq('semester_id',sem.id).eq('course_key',courseKey).eq('week',w).order('period');
    if(ctrlR.error){
      $('#taBody').innerHTML=`<div class="bad">출석 열기·마감 상태를 불러오지 못했습니다: ${esc(ctrlR.error.message)}</div>`;
      return;
    }
    const controls=ctrlR.data||[];
    const ctrlBy=new Map(controls.map(c=>[Number(c.period),c]));
    const by=new Map((recs||[]).map(r=>[`${r.student_id}-${r.period}`,r]));

    const stateOf=(period,kind)=>ctrlBy.get(Number(period))?.[`${kind}_state`]||'waiting';
    const endClosed=period=>stateOf(period,'end')==='closed';

    const status=(r,finalized,closed=false)=>{
      const done=!!finalized||!!closed;
      if(!r)return done?'결석':'미확인';
      if(r.start_ok&&r.end_ok)return'출석';
      if(!r.start_ok&&r.end_ok)return'지각';
      if(r.start_ok&&!r.end_ok)return done?'조퇴':'시작확인';
      return done?'결석':'미확인';
    };
    const statusKey=(r,finalized,closed=false)=>{
      const s=status(r,finalized,closed);
      if(s==='출석')return'present';if(s==='지각')return'late';if(s==='조퇴')return'early';if(s==='결석')return'absent';return'absent';
    };
    const optionHtml=(r,finalized)=>{
      const cur=statusKey(r,finalized,true);
      return [['present','출석'],['late','지각'],['early','조퇴'],['absent','결석']].map(([v,t])=>`<option value="${v}" ${cur===v?'selected':''}>${t}</option>`).join('');
    };

    const gateButton=(period,kind)=>{
      const state=stateOf(period,kind),label=kind==='start'?'시작 출석':'종료 출석';
      let bg='#e5e7eb',fg='#374151',text=`${label} 열기`;
      if(state==='open'){bg='#16a34a';fg='white';text=`${label} 마감`}
      else if(state==='closed'){bg='#dc2626';fg='white';text=`${label} 마감됨`}
      const disabled=!!week?.finalized;
      return `<button type="button" data-gate-period="${period}" data-gate-kind="${kind}" data-gate-state="${state}" ${disabled?'disabled':''} style="background:${bg};color:${fg};border-color:${bg};min-height:40px;opacity:${disabled?'.55':'1'}">${disabled?'주차 확정됨':text}</button>`;
    };

    const auto=w===1;
    const canEdit=!auto&&!!week?.finalized;
    const showAudit=!auto;
    const anyGateOpen=controls.some(c=>c.start_state==='open'||c.end_state==='open');

    $('#taBody').innerHTML=`
      ${auto?'<div class="notice" style="margin-bottom:10px"><b>1주차 자동 출석 고정</b><br>명단이 2주차에 확정되므로 모든 학생의 1주차 1·2·3교시는 자동으로 출석 처리됩니다. 출석 단어 입력과 주차 확정 작업이 필요하지 않습니다.</div>':''}
      ${!auto&&!week?.finalized?'<div class="notice" style="margin-bottom:10px"><b>교시별 출석 열기·마감</b><br><b style="color:#15803d">초록색 = 학생 입력 가능</b> · <b style="color:#dc2626">빨간색 = 마감</b> · 회색 = 아직 열지 않음. 종료 출석을 열면 그 교시의 시작 출석은 자동 마감됩니다.</div>':''}
      ${!auto&&week?.finalized?'<div class="notice" style="margin-bottom:10px"><b>교수자 출석 수정 가능</b><br>학생별 상태를 바꾼 뒤 <b>수정 저장</b>을 누르세요. 학생이 실제 입력한 시간은 수정해도 보존되며, 교수 수정 이력도 별도로 기록됩니다.</div>':''}
      ${!auto&&!week?.finalized?'<div class="muted" style="margin-bottom:10px">학생별 출석 수정은 먼저 이 주차의 출석을 확정한 뒤 사용할 수 있습니다. <b>기록 보기</b>는 확정 전에도 사용할 수 있습니다.</div>':''}
      <div class="grid g3">
        ${[1,2,3].map(i=>{
          const x=(words||[]).find(a=>a.period===i)||{};
          const c=ctrlBy.get(i)||{};
          return `<div class="q">
            <b>${i}교시</b>
            <label>시작 단어<input data-start="${i}" value="${esc(x.start_word||'')}" ${auto||week?.finalized?'disabled':''}></label>
            <label>종료 단어<input data-end="${i}" value="${esc(x.end_word||'')}" ${auto||week?.finalized?'disabled':''}></label>
            ${!auto?`<div class="row" style="margin-top:10px;gap:7px;flex-wrap:wrap">${gateButton(i,'start')}${gateButton(i,'end')}</div>
            <div class="muted" style="margin-top:7px">시작: ${c.start_state==='open'?'<b style="color:#15803d">입력 가능</b>':c.start_state==='closed'?'<b style="color:#dc2626">마감</b>':'대기'} · 종료: ${c.end_state==='open'?'<b style="color:#15803d">입력 가능</b>':c.end_state==='closed'?'<b style="color:#dc2626">마감</b>':'대기'}</div>`:''}
          </div>`;
        }).join('')}
      </div>
      <div class="row"><button id="saveWords" class="primary" ${auto||week?.finalized?'disabled':''}>${auto?'1주차 단어 입력 불필요':'6개 단어 저장'}</button><button id="finalizeWeek" class="${week?.finalized?'danger':''}" ${auto?'disabled':''}>${auto?'1주차 자동 출석 고정':(week?.finalized?'주차 확정 해제':'이 주차 출석 확정')}</button></div>
      <div id="taMsg" class="muted" style="margin-top:8px"></div>
      <div class="q"><b>${w}주차 상태: ${auto?'자동 출석 확정':(week?.finalized?'확정됨':'아직 미확정')}</b>${anyGateOpen?' · <span style="color:#15803d">출석 입력 진행 중</span>':''}</div>
      <div class="tablewrap"><table><thead><tr><th>학번</th><th>이름</th><th>1교시</th><th>2교시</th><th>3교시</th>${showAudit?'<th>기록</th>':''}${canEdit?'<th>수정</th>':''}</tr></thead><tbody>
        ${(roster||[]).map(s=>`<tr><td>${esc(s.student_no||'-')}</td><td>${esc(s.name)}</td>${[1,2,3].map(p=>{const r=by.get(`${s.id}-${p}`);return canEdit?`<td><select data-att-status="${s.id}-${p}" style="min-width:82px">${optionHtml(r,true)}</select></td>`:`<td>${status(r,week?.finalized,endClosed(p))}</td>`}).join('')}${showAudit?`<td><button class="smallbtn" data-audit-att="${s.id}">기록 보기</button></td>`:''}${canEdit?`<td><button class="smallbtn" data-save-att="${s.id}">수정 저장</button></td>`:''}</tr>`).join('')}
      </tbody></table></div>
      <div id="auditPanel" class="card hidden" style="margin-top:12px;background:#fafbff"></div>`;

    if(auto)return;

    $('#saveWords').onclick=async()=>{
      if(anyGateOpen){msg($('#taMsg'),'출석 입력이 진행 중입니다. 시작·종료 출석을 모두 마감한 뒤 단어를 수정하세요.');return}
      const rows=[1,2,3].map(p=>({semester_id:sem.id,...(!isChinese(teacherCourse)?{slot:course(teacherCourse).slot}:{}),week:w,period:p,start_word:$(`[data-start="${p}"]`).value.trim(),end_word:$(`[data-end="${p}"]`).value.trim()}));
      const table=isChinese(teacherCourse)?`${cPrefix(teacherCourse)}_attendance_words`:'lg_attendance_words';
      const conflict=isChinese(teacherCourse)?'semester_id,week,period':'semester_id,slot,week,period';
      const {error}=await sb.from(table).upsert(rows,{onConflict:conflict});
      if(error)msg($('#taMsg'),error.message);else msg($('#taMsg'),'출석 단어 6개를 저장했습니다.',true);
    };

    $('#taBody').querySelectorAll('[data-gate-kind]').forEach(btn=>{
      btn.onclick=async()=>{
        const period=Number(btn.dataset.gatePeriod),kind=btn.dataset.gateKind,state=btn.dataset.gateState;
        let action=state==='open'?'close':'open';
        const label=kind==='start'?'시작 출석':'종료 출석';

        if(state==='open'){
          const text=kind==='end'
            ?`${period}교시 종료 출석을 마감할까요?\n마감 후 학생들은 종료 단어를 더 이상 입력할 수 없습니다.`
            :`${period}교시 시작 출석을 마감할까요?\n마감 후 학생들은 시작 단어를 더 이상 입력할 수 없습니다.`;
          if(!confirm(text))return;
        }else if(state==='closed'){
          if(!confirm(`${period}교시 ${label}을 다시 열까요?`))return;
        }else if(kind==='end'){
          if(!confirm(`${period}교시 종료 출석을 시작할까요?\n종료 출석을 열면 시작 출석은 자동으로 마감됩니다.`))return;
        }

        btn.disabled=true;
        const {data,error}=await sb.rpc('teacher_set_attendance_gate',{
          p_semester_id:sem.id,p_course_key:courseKey,p_week:w,p_period:period,p_kind:kind,p_action:action
        });
        if(error||!data?.ok){
          msg($('#taMsg'),data?.message||error?.message||'출석 버튼 변경에 실패했습니다.');
          btn.disabled=false;
          return;
        }
        const done=action==='open'?`${period}교시 ${label}을 열었습니다.`:`${period}교시 ${label}을 마감했습니다.`;
        msg($('#taMsg'),done,true);
        load();
      };
    });

    $('#finalizeWeek').onclick=async()=>{
      if(!week?.finalized){
        const extra=anyGateOpen?'\n현재 입력 중인 출석 버튼이 있습니다. 주차를 확정하면 학생 입력은 더 이상 인정되지 않습니다.':'';
        if(!confirm(`${w}주차 출석을 확정할까요? 미입력 교시는 결석으로 기록됩니다.${extra}`))return;
      }
      let r;
      if(isChinese(teacherCourse))r=await sb.rpc(`${cPrefix(teacherCourse)}_set_attendance_week_finalized`,{p_semester_id:sem.id,p_week:w,p_finalized:!week?.finalized});
      else r=await sb.rpc('lg_set_attendance_week_finalized',{p_semester_id:sem.id,p_slot:course(teacherCourse).slot,p_week:w,p_finalized:!week?.finalized});
      if(r.error)alert(r.error.message);else load();
    };

    $('#taBody').querySelectorAll('[data-audit-att]').forEach(btn=>{
      btn.onclick=async()=>{
        const sid=Number(btn.dataset.auditAtt),st=(roster||[]).find(x=>Number(x.id)===sid),panel=$('#auditPanel');if(!st)return;
        panel.classList.remove('hidden');panel.innerHTML=`<h3 class="section-title">학번 ${esc(st.student_no||'-')} · ${esc(st.name)} · ${w}주차 기록</h3><div class="muted">기록을 불러오는 중…</div>`;
        const [attemptR,editR]=await Promise.all([
          sb.from('attendance_attempt_logs').select('*').eq('semester_id',sem.id).eq('course_key',courseKey).eq('student_id',sid).eq('week',w).order('attempted_at',{ascending:false}).limit(100),
          sb.from('attendance_manual_edit_logs').select('*').eq('semester_id',sem.id).eq('course_key',courseKey).eq('student_id',sid).eq('week',w).order('edited_at',{ascending:false}).limit(100)
        ]);
        if(attemptR.error||editR.error){panel.innerHTML=`<h3 class="section-title">학번 ${esc(st.student_no||'-')} · ${esc(st.name)} · ${w}주차 기록</h3><div class="bad">기록을 불러오지 못했습니다: ${esc(attemptR.error?.message||editR.error?.message||'오류')}</div>`;return}
        const periods=[1,2,3].map(p=>{const r=by.get(`${sid}-${p}`),c=ctrlBy.get(p)||{};return `<div class="q"><b>${p}교시</b><div>현재 상태: <b>${status(r,week?.finalized,endClosed(p))}</b></div><div class="muted">학생 시작 입력: ${fmtDT(r?.start_checked_at)}</div><div class="muted">학생 종료 입력: ${fmtDT(r?.end_checked_at)}</div><div class="muted">시작 출석: ${c.start_state==='open'?'입력 가능':c.start_state==='closed'?'마감':'대기'} · 종료 출석: ${c.end_state==='open'?'입력 가능':c.end_state==='closed'?'마감':'대기'}</div></div>`}).join('');
        const attempts=attemptR.data||[],edits=editR.data||[];
        const attemptHtml=attempts.length?attempts.map(a=>`<tr><td>${fmtDT(a.attempted_at)}</td><td>${a.period}교시</td><td>${a.attempt_kind==='start'?'시작':a.attempt_kind==='end'?'종료':'확인 시도'}</td><td>${a.success?'✅ 성공':'❌ 실패'}</td><td>${esc(a.result_message)}</td><td>${esc(a.attempted_word||'-')}</td></tr>`).join(''):'<tr><td colspan="6" class="muted">서버에 도달한 출석 확인 시도 기록이 없습니다.</td></tr>';
        const editHtml=edits.length?edits.map(e=>`<tr><td>${fmtDT(e.edited_at)}</td><td>${e.period}교시</td><td>${esc(e.old_status)} → <b>${esc(e.new_status)}</b></td><td>${esc(e.editor_email||'-')}</td></tr>`).join(''):'<tr><td colspan="4" class="muted">교수자 수동수정 기록이 없습니다.</td></tr>';
        panel.innerHTML=`<div class="row"><h3 class="section-title" style="margin:0">학번 ${esc(st.student_no||'-')} · ${esc(st.name)} · ${w}주차 기록</h3><button id="closeAudit">닫기</button></div><div class="grid g3" style="margin-top:10px">${periods}</div><h4>학생 출석 확인 시도</h4><div class="muted" style="margin-bottom:6px">성공·실패와 입력 일시를 기록합니다. 마감 후 입력 시도는 <b>시작/종료 출석 마감</b>으로 기록됩니다. 휴대폰의 통신이 끊겨 요청이 서버까지 도달하지 않은 경우에는 기록이 남지 않을 수 있습니다.</div><div class="tablewrap"><table><thead><tr><th>일시</th><th>교시</th><th>구분</th><th>결과</th><th>사유</th><th>입력 단어</th></tr></thead><tbody>${attemptHtml}</tbody></table></div><h4 style="margin-top:14px">교수자 수동수정 이력</h4><div class="tablewrap"><table><thead><tr><th>수정일시</th><th>교시</th><th>변경</th><th>수정자</th></tr></thead><tbody>${editHtml}</tbody></table></div>`;
        $('#closeAudit').onclick=()=>panel.classList.add('hidden');
        panel.scrollIntoView({behavior:'smooth',block:'nearest'});
      };
    });

    if(canEdit){
      $('#taBody').querySelectorAll('[data-save-att]').forEach(btn=>{
        btn.onclick=async()=>{
          const sid=Number(btn.dataset.saveAtt),st=(roster||[]).find(x=>Number(x.id)===sid);if(!st)return;
          if(!confirm(`학번 ${st.student_no||'-'} ${st.name} 학생의 ${w}주차 출석 상태를 수정할까요?`))return;
          const reqs=[1,2,3].map(period=>{const p_status=$(`[data-att-status="${sid}-${period}"]`).value;if(isChinese(teacherCourse))return sb.rpc(`${cPrefix(teacherCourse)}_teacher_set_attendance_status`,{p_semester_id:sem.id,p_student_id:sid,p_week:w,p_period:period,p_status});return sb.rpc('lg_teacher_set_attendance_status',{p_semester_id:sem.id,p_slot:course(teacherCourse).slot,p_student_id:sid,p_week:w,p_period:period,p_status})});
          const results=await Promise.all(reqs),bad=results.find(r=>r.error||!r.data?.ok);if(bad){alert(bad.data?.message||bad.error?.message||'출석 수정에 실패했습니다.');return}msg($('#taMsg'),`학번 ${st.student_no||'-'} ${st.name} 학생의 ${w}주차 출석을 수정했습니다.`,true);load();
        };
      });
    }
  };
  $('#taWeek').onchange=load;load();
}

async function renderTeacherQuiz(){if(!isChinese(teacherCourse)){currentTeacherTab='midterm';switchTeacherPane('midterm');return renderTeacherMidterm()}const pane=$('#tquiz'),sem=selectedSemester(),p=cPrefix(teacherCourse);const {data:qs,error}=await sb.from(`${p}_quizzes`).select('*').eq('semester_id',sem.id).order('round');if(error){pane.innerHTML=`<div class="card bad">${esc(error.message)}</div>`;return}const maxRound=(qs||[]).reduce((m,q)=>Math.max(m,q.round),0);pane.innerHTML=`<div class="card"><div class="row"><div><h3 class="section-title">${esc(courseLabel(teacherCourse))} 듣기평가</h3><div class="muted">각 회차 5~6문항, 누적 원점수를 30점으로 환산합니다.</div></div><button id="addQuizBtn" class="primary">제${maxRound+1}차 추가</button></div></div>${(qs||[]).map(q=>quizEditor(q)).join('')||'<div class="card muted">아직 만든 듣기평가가 없습니다.</div>'}`;$('#addQuizBtn').onclick=async()=>{const {error}=await sb.from(`${p}_quizzes`).insert({semester_id:sem.id,round:maxRound+1,answer_key:['A','A','A','A','A'],is_open:false,counted:true});if(error)alert(error.message);else renderTeacherQuiz()};pane.querySelectorAll('[data-save-quiz]').forEach(btn=>btn.onclick=async()=>{const id=Number(btn.dataset.saveQuiz),card=btn.closest('.card'),count=Number(card.querySelector('[data-qcount]').value),answers=[...card.querySelectorAll('[data-qans]')].slice(0,count).map(x=>x.value);const {error}=await sb.from(`${p}_quizzes`).update({answer_key:answers,is_open:card.querySelector('[data-qopen]').checked,counted:card.querySelector('[data-qcounted]').checked}).eq('id',id);if(error)alert(error.message);else{btn.textContent='저장됨';setTimeout(()=>btn.textContent='설정 저장',900)}})}
function quizEditor(q){const vals=[...q.answer_key];while(vals.length<6)vals.push('A');return `<div class="card"><div class="row"><h3 style="margin:0">제${q.round}차</h3><div class="toolbar"><label>문항 수<select data-qcount><option value="5" ${q.answer_key.length===5?'selected':''}>5</option><option value="6" ${q.answer_key.length===6?'selected':''}>6</option></select></label><label style="display:flex;align-items:center;gap:6px"><input data-qopen type="checkbox" style="width:auto;min-height:auto" ${q.is_open?'checked':''}> 학생에게 공개</label><label style="display:flex;align-items:center;gap:6px"><input data-qcounted type="checkbox" style="width:auto;min-height:auto" ${q.counted?'checked':''}> 중간고사 반영</label></div></div><div class="ansgrid" style="margin-top:10px">${vals.map((a,i)=>`<label>${i+1}번${i===5?' (6문항 시)':''}<select data-qans>${['A','B','C','D'].map(c=>`<option ${a===c?'selected':''}>${c}</option>`).join('')}</select></label>`).join('')}</div><button data-save-quiz="${q.id}" class="primary" style="margin-top:10px">설정 저장</button></div>`}

async function renderTeacherMidterm(){if(isChinese(teacherCourse))return;const pane=$('#tmidterm'),sem=selectedSemester(),sl=course(teacherCourse).slot;const [{data:roster},{data:scores}]=await Promise.all([sb.from('lg_students').select('id,student_no,name').eq('semester_id',sem.id).eq('slot',sl).order('student_no'),sb.from('lg_midterm_scores').select('*').eq('semester_id',sem.id).eq('slot',sl)]);const sm=new Map((scores||[]).map(x=>[x.student_id,x]));pane.innerHTML=`<div class="card"><div class="row"><div><h3 class="section-title">${esc(courseLabel(teacherCourse))} 중간발표</h3><div class="muted">30점 만점 · 교수자가 학생별 점수를 직접 입력합니다.</div></div><button id="saveMidterm" class="primary">전체 점수 저장</button></div><div id="midMsg" class="muted" style="margin-top:8px"></div></div><div class="card"><div class="tablewrap"><table><thead><tr><th>학번</th><th>이름</th><th>중간발표 /30</th><th>메모</th></tr></thead><tbody>${(roster||[]).map(s=>{const x=sm.get(s.id)||{};return `<tr><td>${esc(s.student_no||'-')}</td><td>${esc(s.name)}</td><td><input data-mid-score="${s.id}" type="number" min="0" max="30" step="0.1" value="${x.score??''}"></td><td><input data-mid-note="${s.id}" value="${esc(x.note||'')}"></td></tr>`}).join('')}</tbody></table></div></div>`;$('#saveMidterm').onclick=async()=>{const rows=[];for(const s of roster||[]){const v=$(`[data-mid-score="${s.id}"]`).value;if(v==='')continue;const score=Number(v);if(score<0||score>30||!Number.isFinite(score)){msg($('#midMsg'),`학번 ${s.student_no||'-'} 점수를 확인하세요.`);return}rows.push({semester_id:sem.id,slot:sl,student_id:s.id,score,note:$(`[data-mid-note="${s.id}"]`).value.trim(),updated_at:new Date().toISOString()})}if(!rows.length){msg($('#midMsg'),'저장할 점수가 없습니다.');return}const {error}=await sb.from('lg_midterm_scores').upsert(rows,{onConflict:'semester_id,slot,student_id'});if(error)msg($('#midMsg'),error.message);else msg($('#midMsg'),`${rows.length}명 점수를 저장했습니다.`,true)}}

async function renderTeacherFinal(){if(isChinese(teacherCourse))return renderTeacherChineseFinal();return renderTeacherLargeFinal()}
async function renderTeacherChineseFinal(){const pane=$('#tfinal'),sem=selectedSemester(),p=cPrefix(teacherCourse);let {data:f,error}=await sb.from(`${p}_final_exam`).select('*').eq('semester_id',sem.id).maybeSingle();if(error){pane.innerHTML=`<div class="card bad">${esc(error.message)}</div>`;return}if(!f){const d=['A','B','C','D','A','B','C','D','A','B','C','D','A','B','C','D','A','B','C','D'];await sb.from(`${p}_final_exam`).insert({semester_id:sem.id,answer_key:d,is_open:false});f={semester_id:sem.id,answer_key:d,is_open:false}}pane.innerHTML=`<div class="card"><div class="row"><div><h3 class="section-title">${esc(courseLabel(teacherCourse))} 기말고사</h3><div class="muted">20문항 × 1점 → 30점 환산</div></div><label style="display:flex;align-items:center;gap:6px"><input id="finalOpen" type="checkbox" style="width:auto;min-height:auto" ${f.is_open?'checked':''}> 학생에게 공개</label></div><div class="ansgrid" style="margin-top:10px">${f.answer_key.map((a,i)=>`<label>${i+1}번<select data-fans>${['A','B','C','D'].map(c=>`<option ${a===c?'selected':''}>${c}</option>`).join('')}</select></label>`).join('')}</div><button id="saveFinal" class="primary" style="margin-top:10px">20문항 정답·공개 설정 저장</button><div id="finalMsg" class="muted" style="margin-top:8px"></div></div>`;$('#saveFinal').onclick=async()=>{const answer_key=[...pane.querySelectorAll('[data-fans]')].map(x=>x.value),is_open=$('#finalOpen').checked;const {error}=await sb.from(`${p}_final_exam`).upsert({semester_id:sem.id,answer_key,is_open},{onConflict:'semester_id'});if(error)msg($('#finalMsg'),error.message);else msg($('#finalMsg'),'기말고사 설정을 저장했습니다.',true)}}
async function renderTeacherLargeFinal(){
  const pane=$('#tfinal'),sem=selectedSemester(),sl=course(teacherCourse).slot;const [{data:ex},{data:subs},{data:roster}]=await Promise.all([sb.from('lg_final_exam').select('*').eq('semester_id',sem.id).eq('slot',sl).maybeSingle(),sb.from('lg_final_submissions').select('*').eq('semester_id',sem.id).eq('slot',sl),sb.from('lg_students').select('id,student_no,name').eq('semester_id',sem.id).eq('slot',sl).order('student_no')]);const questions=(ex?.questions?.length?ex.questions:[{id:'q1',prompt:'',max_score:30,criteria:''}]);const subMap=new Map((subs||[]).map(x=>[x.student_id,x]));
  pane.innerHTML=`<div class="card"><div class="row"><div><h3 class="section-title">${esc(courseLabel(teacherCourse))} 논술형 기말고사</h3><div class="muted">문제 수는 자유 · 전체 배점 합계는 30점</div></div><label style="display:flex;align-items:center;gap:6px"><input id="essayOpen" type="checkbox" style="width:auto;min-height:auto" ${ex?.is_open?'checked':''}> 학생에게 공개</label></div><label style="display:block;max-width:360px;margin-top:10px">시험 접속코드(선택)<input id="essayAccessCode" value="${esc(ex?.access_code||'')}" placeholder="비워두면 접속코드 없음"></label><div id="questionEditors" style="margin-top:12px"></div><div class="row"><button id="addEssayQ">문제 추가</button><button id="saveEssayExam" class="primary">문제·기준·공개 설정 저장</button></div><div id="essayTeacherMsg" class="muted" style="margin-top:8px"></div></div><div class="card"><div class="row"><div><h3 class="section-title">제출·채점 현황</h3><div class="muted">AI 점수는 제안점수이며 교수자가 최종 점수를 수정·확정할 수 있습니다.</div></div></div><div class="tablewrap"><table><thead><tr><th>학번</th><th>이름</th><th>제출</th><th>AI점수</th><th>교수자점수</th><th>반영점수</th><th>답안</th></tr></thead><tbody>${(roster||[]).map(s=>{const f=subMap.get(s.id);const applied=f?(f.teacher_score??f.ai_score??''):' ';return `<tr><td>${esc(s.student_no||'-')}</td><td>${esc(s.name)}</td><td>${f?.is_submitted?'✅':'-'}</td><td>${f?.ai_score??'-'}</td><td>${f?.teacher_score??'-'}</td><td><b>${applied===''?'-':applied}</b></td><td>${f?.is_submitted?`<button data-view-essay="${s.id}" class="smallbtn">보기·채점</button>`:'-'}</td></tr>`}).join('')}</tbody></table></div></div><div id="essayDetail"></div>`;
  let editorQuestions=questions.map((q,i)=>({id:q.id||`q${i+1}`,prompt:q.prompt||'',max_score:Number(q.max_score||0),criteria:q.criteria||''}));
  const drawEditors=()=>{const box=$('#questionEditors');box.innerHTML=editorQuestions.map((q,i)=>`<div class="q criteria"><div class="row"><b>문제 ${i+1}</b><button data-remove-q="${i}" class="smallbtn danger" ${editorQuestions.length===1?'disabled':''}>삭제</button></div><label>문제<textarea data-prompt="${i}">${esc(q.prompt)}</textarea></label><div class="grid g2"><label>배점<input data-max="${i}" type="number" min="0" max="30" step="0.5" value="${q.max_score}"></label><label>정답에 필요한 핵심 내용<textarea data-criteria="${i}" placeholder="AI가 반드시 확인할 핵심 내용, 개념, 논점 등을 구체적으로 입력하세요.">${esc(q.criteria)}</textarea></label></div></div>`).join('');box.querySelectorAll('[data-remove-q]').forEach(b=>b.onclick=()=>{editorQuestions.splice(Number(b.dataset.removeQ),1);drawEditors()})};drawEditors();
  $('#addEssayQ').onclick=()=>{editorQuestions.push({id:`q${Date.now()}`,prompt:'',max_score:0,criteria:''});drawEditors()};
  $('#saveEssayExam').onclick=async()=>{const qs=editorQuestions.map((q,i)=>({id:q.id||`q${i+1}`,prompt:$(`[data-prompt="${i}"]`).value.trim(),max_score:Number($(`[data-max="${i}"]`).value),criteria:$(`[data-criteria="${i}"]`).value.trim()}));if(qs.some(q=>!q.prompt)){msg($('#essayTeacherMsg'),'모든 문제 내용을 입력하세요.');return}const total=qs.reduce((s,q)=>s+q.max_score,0);if(Math.abs(total-30)>0.001){msg($('#essayTeacherMsg'),`배점 합계가 ${fmt(total,1)}점입니다. 정확히 30점으로 맞춰주세요.`);return}const {error}=await sb.from('lg_final_exam').upsert({semester_id:sem.id,slot:sl,questions:qs,is_open:$('#essayOpen').checked,access_code:$('#essayAccessCode').value.trim(),updated_at:new Date().toISOString()},{onConflict:'semester_id,slot'});if(error)msg($('#essayTeacherMsg'),error.message);else{msg($('#essayTeacherMsg'),'기말고사 문제와 채점 기준을 저장했습니다.',true);setTimeout(renderTeacherLargeFinal,500)}};
  pane.querySelectorAll('[data-view-essay]').forEach(b=>b.onclick=()=>showEssayDetail(Number(b.dataset.viewEssay),roster,subMap,questions,sem.id,sl));
}
async function showEssayDetail(studentId,roster,subMap,questions,semId,sl){const s=(roster||[]).find(x=>x.id===studentId),f=subMap.get(studentId);if(!s||!f)return;const feedback=f.ai_feedback||{};$('#essayDetail').innerHTML=`<div class="card"><div class="row"><div><h3 class="section-title">학번 ${esc(s.student_no||'-')} · ${esc(s.name)} 답안</h3><div class="muted">제출: ${f.submitted_at?new Date(f.submitted_at).toLocaleString():'-'}</div></div><button id="closeEssayDetail">닫기</button></div>${(questions||[]).map((q,i)=>`<div class="q"><div class="row"><b>${i+1}. ${esc(q.prompt)}</b><span class="badge">${q.max_score}점</span></div><div class="criteria"><b>교수자 채점 기준</b><div>${esc(q.criteria||'')}</div></div><div style="margin-top:10px;white-space:pre-wrap">${esc((f.answers||{})[q.id]||'')}</div></div>`).join('')}<div class="grid g2"><label>교수자 최종 점수 /30<input id="teacherFinalScore" type="number" min="0" max="30" step="0.1" value="${f.teacher_score??''}"></label><div><div class="muted">AI 제안 점수</div><div class="score">${f.ai_score==null?'-':fmt(f.ai_score)} / 30</div></div></div>${f.ai_feedback?`<div class="q"><b>AI 평가 설명</b><pre style="white-space:pre-wrap;font-family:inherit">${esc(JSON.stringify(f.ai_feedback,null,2))}</pre></div>`:''}<div class="row"><div><button id="aiGradeEssay">AI 채점</button> <button id="copyGradePacket">AI 채점용 내용 복사</button></div><button id="saveTeacherFinal" class="primary">교수자 점수 저장</button></div><div id="essayGradeMsg" class="muted" style="margin-top:8px"></div></div>`;
  $('#closeEssayDetail').onclick=()=>$('#essayDetail').innerHTML='';
  $('#saveTeacherFinal').onclick=async()=>{const raw=$('#teacherFinalScore').value;if(raw===''){msg($('#essayGradeMsg'),'점수를 입력하세요.');return}const score=Number(raw);if(score<0||score>30){msg($('#essayGradeMsg'),'0~30점 사이로 입력하세요.');return}const {error}=await sb.from('lg_final_submissions').update({teacher_score:score,graded_at:new Date().toISOString()}).eq('semester_id',semId).eq('slot',sl).eq('student_id',studentId);if(error)msg($('#essayGradeMsg'),error.message);else{msg($('#essayGradeMsg'),'교수자 점수를 저장했습니다.',true);setTimeout(renderTeacherLargeFinal,500)}};
  $('#copyGradePacket').onclick=async()=>{const text=`다음 논술형 기말고사 답안을 30점 만점으로 평가해 주세요. 교수자가 제시한 채점 기준의 내용 반영 정도와 정확성을 중심으로 판단하고, 문제별 점수와 총점을 제시하세요.\n\n${(questions||[]).map((q,i)=>`[문제 ${i+1} / ${q.max_score}점]\n${q.prompt}\n[채점 기준]\n${q.criteria}\n[학생 답안]\n${(f.answers||{})[q.id]||''}`).join('\n\n')}`;await navigator.clipboard.writeText(text);msg($('#essayGradeMsg'),'AI 채점용 내용을 복사했습니다.',true)};
  $('#aiGradeEssay').onclick=async()=>{msg($('#essayGradeMsg'),'AI 채점 중…',true);try{const {data,error}=await sb.functions.invoke('grade-essay',{body:{questions:(questions||[]).map(q=>({id:q.id,prompt:q.prompt,max_score:Number(q.max_score),criteria:q.criteria||''})),answers:f.answers||{}}});if(error)throw error;if(!data||typeof data.total_score!=='number')throw new Error('AI 응답 형식이 올바르지 않습니다.');const score=Math.max(0,Math.min(30,Number(data.total_score)));const u=await sb.from('lg_final_submissions').update({ai_score:score,ai_feedback:data,graded_at:new Date().toISOString()}).eq('semester_id',semId).eq('slot',sl).eq('student_id',studentId);if(u.error)throw u.error;msg($('#essayGradeMsg'),`AI 제안점수 ${fmt(score)} / 30 저장 완료`,true);setTimeout(renderTeacherLargeFinal,600)}catch(e){msg($('#essayGradeMsg'),'AI 자동채점 서버가 아직 연결되지 않았습니다. 아래의 AI 채점용 내용 복사 기능은 바로 사용할 수 있습니다.') }};
}

async function renderTeacherHomework(){if(isChinese(teacherCourse))return renderTeacherChineseHomework();return renderTeacherLargeHomework()}
async function renderTeacherChineseHomework(){const pane=$('#thomework'),sem=selectedSemester(),p=cPrefix(teacherCourse);pane.innerHTML=`<div class="card"><h3 class="section-title">${esc(courseLabel(teacherCourse))} 과제</h3><div class="muted">교수자 휴대폰에 QR을 띄우고, 과제물을 직접 확인한 학생이 자기 휴대폰으로 QR을 찍으면 해당 주차 과제가 확인됩니다.</div><label style="max-width:220px;display:block;margin-top:10px">주차<select id="thwWeek">${weekOpts()}</select></label><div id="thwBody" style="margin-top:10px"></div></div>`;const load=async()=>{const w=Number($('#thwWeek').value);const [{data:h},{data:roster},{data:recs}]=await Promise.all([sb.from(`${p}_homework`).select('*').eq('semester_id',sem.id).eq('week',w).maybeSingle(),sb.from(`${p}_students`).select('id,student_no,name').eq('semester_id',sem.id),sb.from(`${p}_homework_records`).select('student_id').eq('semester_id',sem.id).eq('week',w)]);const code=h?.code||'',confirmed=new Set((recs||[]).map(x=>x.student_id));$('#thwBody').innerHTML=`<div class="grid g2"><label>인증코드<input id="hwTeacherCode" value="${esc(code)}" placeholder="자동생성 또는 직접 입력"></label><div class="toolbar"><button id="genHwCode">코드 자동생성</button><label style="display:flex;align-items:center;gap:6px"><input id="hwOpen" type="checkbox" style="width:auto;min-height:auto" ${h?.is_open?'checked':''}> 학생에게 공개</label><label style="display:flex;align-items:center;gap:6px"><input id="hwCounted" type="checkbox" style="width:auto;min-height:auto" ${h?.counted!==false?'checked':''}> 성적 반영</label></div></div><button id="saveHw" class="primary" style="margin-top:10px">과제 설정 저장</button><div id="hwTeacherMsg" class="muted" style="margin-top:8px"></div><div class="q"><b>확인 현황: ${confirmed.size}/${(roster||[]).length}명</b></div><div id="hwQR"></div>`;$('#genHwCode').onclick=()=>{$('#hwTeacherCode').value=`HW${String(w).padStart(2,'0')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`};$('#saveHw').onclick=async()=>{const code=$('#hwTeacherCode').value.trim();if(!code){msg($('#hwTeacherMsg'),'인증코드를 입력하세요.');return}const row={semester_id:sem.id,week:w,code,is_open:$('#hwOpen').checked,counted:$('#hwCounted').checked};const {error}=await sb.from(`${p}_homework`).upsert(row,{onConflict:'semester_id,week'});if(error)msg($('#hwTeacherMsg'),error.message);else{msg($('#hwTeacherMsg'),'과제 설정을 저장했습니다.',true);drawChineseHomeworkQR(w,code,sem.is_active)}};if(code)drawChineseHomeworkQR(w,code,sem.is_active)};$('#thwWeek').onchange=load;load()}
function drawChineseHomeworkQR(week,code,isActive){const box=$('#hwQR');if(!box)return;const url=baseUrl();url.searchParams.set('course',teacherCourse);url.searchParams.set('homework_week',week);url.searchParams.set('code',code);box.innerHTML=`<div class="muted">${isActive?'교수자 휴대폰에 띄울 과제 확인 QR':'이 학기는 비활성 학기이므로 QR은 보관용입니다.'}</div><div id="hwQRImg" class="qrbox" style="margin-top:8px"></div><div class="muted" style="word-break:break-all;margin-top:6px">${esc(url.href)}</div>`;new QRCode($('#hwQRImg'),{text:url.href,width:220,height:220})}
async function renderTeacherLargeHomework(){
  clearInterval(homeworkQrTimer);homeworkQrTimer=null;const pane=$('#thomework'),sem=selectedSemester(),sl=course(teacherCourse).slot;pane.innerHTML=`<div class="card bigqr"><div class="row"><div><h3 class="section-title">${esc(courseLabel(teacherCourse))} 기말 과제 제출 QR</h3><div class="muted">기말고사 당일 한 번 사용 · 학생별 1회만 인정 · 여러 학생 동시 인증 가능</div></div><div><button id="startDynQR" class="primary">과제 QR 시작</button> <button id="stopDynQR" class="danger">QR 종료</button></div></div><div class="notice" style="margin-top:10px">학생은 퇴실하면서 실물 과제를 교수님께 제출한 직후 교수님 휴대폰의 QR을 찍습니다. QR은 약 3초마다 바뀌고 각 인증값은 5초만 유효합니다. 학생 휴대폰은 미리 해당 과목에 로그인해 두는 것이 좋습니다.</div><div id="dynStatus" class="q"><b>상태 확인 중…</b></div><div id="dynQR" class="qrbox"></div><div id="dynMsg" class="muted" style="margin-top:8px"></div></div>`;
  const update=async()=>{const {data,error}=await sb.rpc('lg_get_homework_qr',{p_semester_id:sem.id,p_slot:sl});if(error){msg($('#dynMsg'),error.message);return}$('#dynStatus').innerHTML=`<b>${data?.active?'QR 작동 중':'QR 꺼짐'} · 제출 확인 ${data?.confirmed||0}/${data?.total||0}명</b>`;const box=$('#dynQR');box.innerHTML='';if(data?.active&&data.token){const url=baseUrl();url.searchParams.set('course',teacherCourse);url.searchParams.set('hwtoken',data.token);new QRCode(box,{text:url.href,width:320,height:320});$('#dynMsg').textContent=`QR 자동 갱신 · 현재 인증값 ${data.valid_seconds}초 유효`;$('#dynMsg').className='ok'}else box.innerHTML='<div class="muted">[과제 QR 시작]을 누르면 이곳에 큰 QR이 표시됩니다.</div>'};
  $('#startDynQR').onclick=async()=>{const {error}=await sb.rpc('lg_start_homework_session',{p_semester_id:sem.id,p_slot:sl});if(error){msg($('#dynMsg'),error.message);return}await update();clearInterval(homeworkQrTimer);homeworkQrTimer=setInterval(update,3000)};
  $('#stopDynQR').onclick=async()=>{if(!confirm('과제 QR을 종료할까요? 종료 즉시 기존 QR은 사용할 수 없습니다.'))return;const {error}=await sb.rpc('lg_stop_homework_session',{p_semester_id:sem.id,p_slot:sl});clearInterval(homeworkQrTimer);homeworkQrTimer=null;if(error)msg($('#dynMsg'),error.message);else update()};
  await update();const {data}=await sb.rpc('lg_get_homework_qr',{p_semester_id:sem.id,p_slot:sl});if(data?.active)homeworkQrTimer=setInterval(update,3000);
}

async function renderTeacherPledge(){
  const pane=$('#tpledge');if(!pane)return;if(isChinese(teacherCourse)){pane.innerHTML='';return}
  const sem=selectedSemester(),sl=course(teacherCourse).slot;
  pane.innerHTML='<div class="card">각서 불러오는 중…</div>';
  const [{data:pledges,error:pe},{data:roster,error:re}]=await Promise.all([
    sb.from('lg_pledges').select('version,content,is_open,updated_at').eq('semester_id',sem.id).eq('slot',sl).order('version',{ascending:false}).limit(1),
    sb.from('lg_students').select('id,student_no,name').eq('semester_id',sem.id).eq('slot',sl).order('student_no')
  ]);
  if(pe||re){pane.innerHTML=`<div class="card bad">${esc(pe?.message||re?.message||'각서를 불러오지 못했습니다.')}</div>`;return}
  const cur=(pledges||[])[0]||{version:0,content:'',is_open:false};let sigs=[];
  if(cur.version>0){const r=await sb.from('lg_pledge_signatures').select('student_id,version,signature_data,confirmed_at').eq('semester_id',sem.id).eq('slot',sl).eq('version',cur.version);if(r.error){pane.innerHTML=`<div class="card bad">${esc(r.error.message)}</div>`;return}sigs=r.data||[]}
  const sm=new Map(sigs.map(x=>[x.student_id,x])),confirmed=sigs.length,total=(roster||[]).length;
  pane.innerHTML=`<div class="card"><div class="row"><div><h3 class="section-title">${esc(courseLabel(teacherCourse))} 각서</h3><div class="muted">교수자가 내용을 입력해 공개하면 학생이 휴대폰에서 읽고 손가락 서명 후 확인합니다. 내용을 바꾸면 새 버전이 되어 학생이 다시 서명해야 합니다.</div></div><span class="badge">현재 버전 ${cur.version||'-'}</span></div><label style="display:block;margin-top:12px">각서 내용<textarea id="pledgeContent" placeholder="학생들에게 확인받을 각서 내용을 입력하세요.">${esc(cur.content||'')}</textarea></label><label class="q" style="display:flex;gap:8px;align-items:center"><input id="pledgeOpen" type="checkbox" style="width:auto;min-height:auto" ${cur.is_open?'checked':''}> 학생에게 공개</label><div class="row"><button id="savePledge" class="primary">각서 저장</button><button id="downloadPledgeCsv">확인현황 CSV</button></div><div id="pledgeTeacherMsg" class="muted" style="margin-top:8px"></div></div><div class="card"><div class="row"><h3 class="section-title">확인 현황</h3><b>${confirmed}/${total}명 완료</b></div><div class="tablewrap"><table style="min-width:720px"><thead><tr><th>학번</th><th>이름</th><th>상태</th><th>확인시각</th><th>서명</th></tr></thead><tbody>${(roster||[]).map(st=>{const x=sm.get(st.id);return `<tr><td>${esc(st.student_no||'-')}</td><td>${esc(st.name)}</td><td>${x?'<span class="ok">확인완료</span>':'-'}</td><td>${x?esc(new Date(x.confirmed_at).toLocaleString()):'-'}</td><td>${x?`<button class="smallbtn" data-sig="${st.id}">서명 보기</button>`:'-'}</td></tr>`}).join('')}</tbody></table></div></div>`;
  $('#savePledge').onclick=async()=>{const content=$('#pledgeContent').value.trim(),isOpen=$('#pledgeOpen').checked;if(isOpen&&!content){msg($('#pledgeTeacherMsg'),'학생에게 공개하려면 각서 내용을 입력하세요.');return}if(cur.content&&content!==cur.content&&!confirm('각서 내용이 변경되었습니다. 저장하면 새 버전이 만들어지고 학생들은 새 각서에 다시 서명해야 합니다. 계속할까요?'))return;const {data,error}=await sb.rpc('lg_save_pledge',{p_semester_id:sem.id,p_slot:sl,p_content:content,p_is_open:isOpen});if(error||!data?.ok){msg($('#pledgeTeacherMsg'),data?.message||error?.message||'저장 실패');return}msg($('#pledgeTeacherMsg'),`각서 버전 ${data.version} 저장 완료`,true);setTimeout(renderTeacherPledge,500)};
  pane.querySelectorAll('[data-sig]').forEach(b=>b.onclick=()=>{const x=sm.get(Number(b.dataset.sig));if(!x?.signature_data)return;const w=window.open('','_blank','width=760,height=420');if(!w)return alert('팝업 차단을 해제한 뒤 다시 눌러주세요.');w.document.write(`<html><head><title>서명</title></head><body style="font-family:sans-serif;padding:20px"><h3>학생 서명</h3><img src="${x.signature_data}" style="max-width:100%;border:1px solid #ccc"><p>${esc(new Date(x.confirmed_at).toLocaleString())}</p></body></html>`);w.document.close()});
  $('#downloadPledgeCsv').onclick=()=>{const head=['학번','이름','각서버전','확인여부','확인시각'];const lines=[head.join(','),...(roster||[]).map(st=>{const x=sm.get(st.id);return [st.student_no||'',csvCell(st.name),cur.version||'',x?'Y':'N',x?csvCell(new Date(x.confirmed_at).toLocaleString()):''].join(',')})];const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${sem.name}_${courseLabel(teacherCourse)}_각서확인현황.csv`;a.click();URL.revokeObjectURL(a.href)};
}

async function renderTeacherGrades(){if(isChinese(teacherCourse))return renderTeacherChineseGrades();return renderTeacherLargeGrades()}
async function renderTeacherChineseGrades(){
  const pane=$('#tgrades'),sem=selectedSemester(),p=cPrefix(teacherCourse);pane.innerHTML='<div class="card">성적 계산 중…</div>';
  const [{data,error},{data:roster}]=await Promise.all([
    sb.rpc(`${p}_teacher_gradebook`,{p_semester_id:sem.id}),
    sb.from(`${p}_students`).select('id,student_no').eq('semester_id',sem.id)
  ]);
  if(error){pane.innerHTML=`<div class="card bad">${esc(error.message)}</div>`;return}
  const noMap=new Map((roster||[]).map(x=>[Number(x.id),x.student_no||'']));
  const rows=(data||[]).map(r=>({...r,student_no:noMap.get(Number(r.student_id))||''}));
  const avg=k=>rows.length?rows.reduce((s,r)=>s+Number(r[k]||0),0)/rows.length:0;
  pane.innerHTML=`<div class="card"><div class="row"><div><h3 class="section-title">${esc(courseLabel(teacherCourse))} 성적</h3><div class="muted">듣기 30 + 출석 20 + 과제 20 + 기말 30 = 100점</div></div><button id="downloadCsv" class="primary">CSV 내려받기</button></div><div class="grid g4" style="margin-top:12px"><div class="stat"><div class="muted">학생 수</div><div class="n">${rows.length}명</div></div><div class="stat"><div class="muted">총점 평균</div><div class="n">${fmt(avg('total'))}</div></div><div class="stat"><div class="muted">중간 평균</div><div class="n">${fmt(avg('midterm'))}</div></div><div class="stat"><div class="muted">기말 평균</div><div class="n">${fmt(avg('final_score'))}</div></div></div></div><div class="card"><div class="tablewrap"><table><thead><tr><th>학번</th><th>이름</th><th>듣기 원점수</th><th>중간/30</th><th>결석</th><th>지각</th><th>조퇴</th><th>출석/20</th><th>과제</th><th>과제/20</th><th>기말 원점수</th><th>기말/30</th><th>총점/100</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.student_no||'-')}</td><td>${esc(r.name)}</td><td>${r.quiz_got}/${r.quiz_max}</td><td>${fmt(r.midterm)}</td><td>${r.absent_periods}</td><td>${r.late_periods}</td><td>${r.early_periods}</td><td>${fmt(r.attendance,3)}</td><td>${r.homework_done}/${r.homework_total}</td><td>${fmt(r.homework_score)}</td><td>${r.final_raw}/20</td><td>${fmt(r.final_score)}</td><td><b>${fmt(r.total)}</b></td></tr>`).join('')}</tbody></table></div></div>`;
  $('#downloadCsv').onclick=()=>downloadChineseCsv(rows,`${sem.name}_${courseLabel(teacherCourse)}`)
}
function downloadChineseCsv(rows,name){const head=['학번','이름','듣기원점수','듣기만점','중간30','결석교시','지각','조퇴','출석20','과제완료','과제전체','과제20','기말원점수','기말30','총점100'];const lines=[head.join(','),...rows.map(r=>[r.student_no||'',csvCell(r.name),r.quiz_got,r.quiz_max,fmt(r.midterm),r.absent_periods,r.late_periods,r.early_periods,fmt(r.attendance,3),r.homework_done,r.homework_total,fmt(r.homework_score),r.final_raw,fmt(r.final_score),fmt(r.total)].join(','))];saveCsv(lines,name)}

async function renderTeacherLargeGrades(){
  const pane=$('#tgrades'),sem=selectedSemester(),sl=course(teacherCourse).slot;pane.innerHTML='<div class="card">성적 계산 중…</div>';
  const [{data,error},{data:roster}]=await Promise.all([
    sb.rpc('lg_teacher_gradebook',{p_semester_id:sem.id,p_slot:sl}),
    sb.from('lg_students').select('id,student_no').eq('semester_id',sem.id).eq('slot',sl)
  ]);
  if(error){pane.innerHTML=`<div class="card bad">${esc(error.message)}</div>`;return}
  const noMap=new Map((roster||[]).map(x=>[Number(x.id),x.student_no||'']));
  const rows=(data||[]).map(r=>({...r,student_no:noMap.get(Number(r.student_id))||''}));
  const avg=k=>rows.length?rows.reduce((s,r)=>s+Number(r[k]||0),0)/rows.length:0;
  pane.innerHTML=`<div class="card"><div class="row"><div><h3 class="section-title">${esc(courseLabel(teacherCourse))} 성적</h3><div class="muted">중간발표 30 + 출석 20 + 과제 20 + 논술형 기말 30 = 100점</div></div><button id="downloadCsv" class="primary">CSV 내려받기</button></div><div class="grid g4" style="margin-top:12px"><div class="stat"><div class="muted">학생 수</div><div class="n">${rows.length}명</div></div><div class="stat"><div class="muted">총점 평균</div><div class="n">${fmt(avg('total'))}</div></div><div class="stat"><div class="muted">중간 평균</div><div class="n">${fmt(avg('midterm'))}</div></div><div class="stat"><div class="muted">기말 평균</div><div class="n">${fmt(avg('final_score'))}</div></div></div></div><div class="card"><div class="tablewrap"><table><thead><tr><th>학번</th><th>이름</th><th>중간/30</th><th>결석</th><th>지각</th><th>조퇴</th><th>출석/20</th><th>과제/20</th><th>기말 제출</th><th>AI점수</th><th>교수자점수</th><th>기말/30</th><th>총점/100</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.student_no||'-')}</td><td>${esc(r.name)}</td><td>${fmt(r.midterm)}</td><td>${r.absent_periods}</td><td>${r.late_periods}</td><td>${r.early_periods}</td><td>${fmt(r.attendance,3)}</td><td>${fmt(r.homework_score)}</td><td>${r.final_submitted?'✅':'-'}</td><td>${r.ai_score??'-'}</td><td>${r.teacher_score??'-'}</td><td>${fmt(r.final_score)}</td><td><b>${fmt(r.total)}</b></td></tr>`).join('')}</tbody></table></div></div>`;
  $('#downloadCsv').onclick=()=>downloadLargeCsv(rows,`${sem.name}_${courseLabel(teacherCourse)}`)
}
function downloadLargeCsv(rows,name){const head=['학번','이름','중간발표30','결석교시','지각','조퇴','출석20','과제20','기말제출','AI점수','교수자점수','기말30','총점100'];const lines=[head.join(','),...rows.map(r=>[r.student_no||'',csvCell(r.name),fmt(r.midterm),r.absent_periods,r.late_periods,r.early_periods,fmt(r.attendance,3),fmt(r.homework_score),r.final_submitted?'Y':'N',r.ai_score??'',r.teacher_score??'',fmt(r.final_score),fmt(r.total)].join(','))];saveCsv(lines,name)}

function saveCsv(lines,name){const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${name}_성적.csv`;a.click();URL.revokeObjectURL(a.href)}

// ---------------- 시작 ----------------
(async()=>{
  const u=new URL(location.href),qcourse=u.searchParams.get('course');if(COURSES[qcourse])setStudentCourse(qcourse);else setStudentCourse('chinese1');
  await loadPublicInfo();
  if(COURSES[qcourse])setStudentCourse(qcourse);
  await restoreStudent(selectedStudentCourse);
  if(!student&&(u.searchParams.get('hwtoken')||u.searchParams.get('homework_week')))$('#loginMsg').textContent='QR 인증을 위해 먼저 학번과 이름으로 로그인하세요. 동적 QR은 매우 짧게 유효하므로 대형강의 학생은 미리 휴대폰 로그인을 해두는 것이 좋습니다.';
})();
