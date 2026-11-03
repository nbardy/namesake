(function () {
  'use strict';
  var sets = [
    ['Cut-and-project octagonal cells','Geometry in both studies','x=P∥n; u=P⊥n; n∈ℤ⁴; u∈W₈','An octagonal acceptance window selects a square/rhombus tiling. This replaces the earlier hex grid with aperiodic geometry.'],
    ['Compact Hamiltonian crests','Implemented shape family','Hₑ(r)=−Aₑρ²/8·(1−r²/ρ²)⁴; r<ρ\nXₕ=J∇H; Tₑ=exp(Xₕ)','The exact radial flow curls a shared edge. Radius is preserved, the inverse negates A, and area is preserved.'],
    ['Silver-ratio fractal material','Implemented material','δ=1+√2; f(x)=Σ δ^(−hj)N((δR±π/4)ʲx+bⱼ)','Finite noise octaves use the same expansion factor as the geometric inflation. This is deliberate scale coupling, not a proof of a substitution-invariant texture.'],
    ['Reversible tidal shears','Implemented in both studies','Sₓ(x,y)=(x+αf(y),y)\nSᵧ(X,y)=(X,y+βg(X)); det D(Sᵧ∘Sₓ)=1','Large-scale bends preserve fitting boundaries. Changing the composition order creates another valid shape family.'],
    ['Four-grid dual construction','Alternative generator','gⱼ(x)=eⱼ·x+γⱼ; gⱼ(x)∈ℤ, j=0…3','Dualize intersections of four line families into squares and rhombi. Generic offsets avoid triple intersections; canonical lattice labels enforce adjacency.'],
    ['A continuum of lifted slopes','Research direction','G(t)=(1,t,1,1,2/t,1), t>0\nG₁₂G₃₄=G₁₃G₂₄−G₁₄G₂₃','Grassmann coordinates satisfy the Plücker constraint. The Ammann–Beenker point is t=√2. A different slope needs a corresponding acceptance window and coverage check.'],
    ['Octagonal symmetry projection','Candidate current field','H₈(x)=(1/8)Σⱼ₌₀⁷ H(Rⱼπ/4 x)','Orbit averaging gives a C₈-invariant scalar field. Its Hamiltonian flow commutes with 45° rotation. Generic fixed-phase fBm does not have that exact symmetry.'],
    ['Inflation-indexed wavelets','Candidate scale hierarchy','ψⱼ,v(x)=δ^(−hj)ψ(δ^(−j)(x−P∥Mʲv))','Index localized wavelets by inflated lattice addresses. A subdivision-compatible decoration needs face substitution and parent/child rules beyond the matrix identity.'],
    ['Noncommuting curl compositions','Candidate shape search','Fₐ,ᵦ=Tₕ,ₐ∘Tₖ,ᵦ∘Tₕ,−ₐ∘Tₖ,−ᵦ','A commutator of exact invertible area-preserving maps creates new deformations while keeping tile coverage. Overlapping supports make order matter.'],
    ['Harmonic tile interiors','Candidate material coordinates','Δu=0 in tile Ω; u|∂Ω=shared boundary data','Solve interior coordinates from common edge values. Invertibility needs its own constraints; harmonicity alone is insufficient.'],
    ['Gauge-linked crest phases','Candidate edge decoration','dᵢⱼ=θⱼ−θᵢ−Aᵢⱼ\nθᵢ′=θᵢ+χᵢ; Aᵢⱼ′=Aᵢⱼ+χⱼ−χᵢ','Phase differences survive local relabeling. This can synchronize decorations, but does not itself change geometry or supply a fluid model.'],
    ['Phason-driven shape families','Candidate geometric variation','u=P⊥n−w; accept u∈W₈; vary w','Moving the internal window changes local configurations through flips. This changes combinatorics; animation requires explicit flip handling.']
  ];
  var list=document.getElementById('equations');
  sets.forEach(function(set,i){
    var d=document.createElement('details'),s=document.createElement('summary'),n=document.createElement('span'),t=document.createElement('span'),status=document.createElement('p'),eq=document.createElement('pre'),p=document.createElement('p');
    n.className='step';n.textContent=String(i+1).padStart(2,'0');t.textContent=set[0];s.append(n,t);status.className='status';status.textContent=set[1];eq.className='equation';eq.textContent=set[2];p.textContent=set[3];d.append(s,status,eq,p);list.append(d);
  });
  var canvas=document.getElementById('ocean'),error=document.getElementById('error'),renderer,frame=0,pending={};
  function fail(){error.hidden=false;}
  try {
    if(!window.OceanTessellation)throw new Error('Renderer did not load.');
    renderer=window.OceanTessellation.create(canvas,{variant:'currents',scale:.7,detail:1,curl:5.4,motion:false,seams:true,tileVariation:.65});
  } catch(e){fail();console.error(e);return;}
  function patch(options){
    Object.assign(pending,options);if(frame)return;
    frame=requestAnimationFrame(function(){frame=0;try{renderer.setOptions(pending);pending={};}catch(e){fail();console.error(e);}});
  }
  ['curl','scale','detail','tileVariation'].forEach(function(key){
    document.getElementById(key).addEventListener('input',function(event){var n=Number(event.target.value),options={};document.getElementById(key+'-value').value=n.toFixed(key==='scale'||key==='tileVariation'?2:1);options[key]=n;patch(options);});
  });
  document.getElementById('seams').addEventListener('change',function(event){patch({seams:event.target.checked});});
  document.getElementById('structure').addEventListener('change',function(event){patch({structure:event.target.checked});});
  document.querySelectorAll('[data-view]').forEach(function(button){
    button.addEventListener('click',function(){
      var view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(function(b){b.setAttribute('aria-pressed',String(b===button));});patch({variant:view});
      canvas.setAttribute('aria-label',view==='escher'?'Interlocking ocean shapes on an eightfold aperiodic tessellation':'Fractal ocean currents flowing through interlocking aperiodic tiles');
      document.getElementById('caption').textContent=view==='escher'?'Complementary crests grow from shared tile boundaries. Each curve belongs to both of its neighbors; the shapes fit because the entire plane is deformed together.':'One ocean flows through the whole pattern. Thin seams reveal the interlocking tiles; four texture families give neighboring tiles distinct fine detail. Turn Tile variation down to compare with the shared ocean alone.';
    });
  });
  window.oceanLab={renderer:renderer,setOptions:patch};
  window.addEventListener('pagehide',function(event){cancelAnimationFrame(frame);frame=0;if(!event.persisted)renderer.destroy();});
  window.addEventListener('pageshow',function(event){if(event.persisted)patch({});});
})();
