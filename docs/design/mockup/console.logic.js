// Bachero console mockup: component logic extracted from bachero-console.html.
// Props: authority (text), density (Comfortable|Compact), liveFeed (boolean).
// Demo data is synthetic; the priority formula matches potholes_map.priority in the migration.
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.listRef = React.createRef();
    this.roads = [
      { name: 'Ferry Road', d: 'M0,14 C20,17 40,10 60,15 S90,21 100,18' },
      { name: 'Wellgate', d: 'M0,52 C25,48 45,58 70,50 S92,44 100,46' },
      { name: 'Northgate', d: 'M30,0 C32,20 27,40 34,60 S30,86 32,100' },
      { name: 'Dock Approach', d: 'M86,0 C84,25 90,45 84,66 S88,88 86,100' },
      { name: 'Kirk Street', d: 'M34,100 C50,78 62,60 78,44 S95,31 100,26' },
      { name: 'Albion Terrace', d: 'M0,32 C22,29 38,36 62,31 S88,26 100,29' },
      { name: 'Carlton Way', d: 'M0,66 C20,63 36,70 58,65 S86,61 100,64' },
      { name: 'Market Row', d: 'M12,4 C14,26 9,48 14,68 S11,90 13,100' },
      { name: 'St Andrews Road', d: 'M56,10 C58,30 52,50 57,70 S54,90 56,100' },
      { name: 'Bridge Lane', d: 'M0,90 C24,86 48,94 72,89 S94,86 100,88' }
    ];
    this.samplers = this.roads.map(r => this.makeSampler(r.d));
    this.state = { items: this.build(), hover: null, hoverSrc: null, sel: [], filter: 'open', tick: 0, veh: this.buildVehicles() };
  }

  makeSampler(d) {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
      document.body.appendChild(svg);
      const len = path.getTotalLength();
      const pts = [];
      for (let i = 0; i <= 200; i++) {
        const p = path.getPointAtLength((i / 200) * len);
        pts.push([p.x, p.y]);
      }
      document.body.removeChild(svg);
      return pts;
    } catch (e) {
      return [[0, 0], [100, 100]];
    }
  }

  at(segIndex, t) {
    const pts = this.samplers[segIndex];
    const i = Math.min(pts.length - 1, Math.max(0, Math.round(t * (pts.length - 1))));
    return pts[i];
  }

  rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  build() {
    const r = this.rng(20260902);
    const out = [];
    for (let i = 0; i < 26; i++) {
      const si = Math.floor(r() * this.roads.length);
      const t = 0.06 + r() * 0.88;
      const pt = this.at(si, t);
      const x = pt[0] + (r() - 0.5) * 1.1;
      const y = pt[1] + (r() - 0.5) * 1.1;
      const severity = Math.round((0.18 + r() * 0.8) * 100) / 100;
      const vehicles = 1 + Math.floor(r() * r() * 6);
      const passes = vehicles * (2 + Math.floor(r() * 9));
      const age = Math.round(r() * 13 * 10) / 10;
      let status = vehicles >= 2 ? 'confirmed' : 'suspected';
      const roll = r();
      if (status === 'confirmed' && roll > 0.82) status = 'scheduled';
      else if (status === 'confirmed' && roll < 0.08) status = 'repaired';
      out.push({
        id: 'p' + i,
        ref: 'BCH-' + String(1040 + i * 7),
        street: this.roads[si].name,
        x, y, severity, vehicles, passes, age, status,
        stop: status === 'scheduled' ? 1 + Math.floor(r() * 8) : null,
        lastPass: (6 + Math.floor(r() * 11)) + ':' + String(Math.floor(r() * 60)).padStart(2, '0'),
        priority: severity * Math.log(1 + vehicles) * (1 + age)
      });
    }
    out.sort((a, b) => b.priority - a.priority);
    return out;
  }

  buildVehicles() {
    return [
      { label: 'Bus 22', seg: 0, t: 0.1, dir: 1 },
      { label: 'Bus 9', seg: 2, t: 0.62, dir: -1 },
      { label: 'Refuse 4', seg: 6, t: 0.35, dir: 1 }
    ];
  }

  componentDidMount() {
    this.onKey = (e) => {
      const rows = this.filtered();
      if (!rows.length) return;
      const i = rows.findIndex(p => p.id === this.state.hover);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
        this.link(rows[n].id, 'map');
      } else if (e.key === 'Enter' && i >= 0) {
        e.preventDefault(); this.toggle(rows[i].id);
      } else if (e.key === 'Escape') {
        this.setState({ sel: [], hover: null });
      }
    };
    window.addEventListener('keydown', this.onKey);
    this.timer = setInterval(() => {
      if (this.props.liveFeed === false) return;
      this.setState(s => ({
        tick: s.tick + 1,
        veh: s.veh.map(v => {
          let t = v.t + v.dir * 0.03;
          let dir = v.dir;
          if (t > 1) { t = 1; dir = -1; } else if (t < 0) { t = 0; dir = 1; }
          return Object.assign({}, v, { t, dir });
        })
      }));
    }, 1200);
  }

  componentWillUnmount() { clearInterval(this.timer); window.removeEventListener('keydown', this.onKey); }

  componentDidUpdate(_, prev) {
    if (prev.hover !== this.state.hover && this.state.hoverSrc === 'map' && this.listRef.current) {
      const rows = this.filtered();
      const i = rows.findIndex(p => p.id === this.state.hover);
      if (i < 0) return;
      const el = this.listRef.current;
      const h = this.rowH();
      const top = i * h;
      if (top < el.scrollTop || top + h > el.scrollTop + el.clientHeight) {
        el.scrollTop = Math.max(0, top - el.clientHeight / 2 + h / 2);
      }
    }
  }

  rowH() { return this.props.density === 'Compact' ? 46 : 58; }

  filtered() {
    const f = this.state.filter;
    return this.state.items.filter(p => {
      if (f === 'all') return true;
      if (f === 'open') return p.status === 'suspected' || p.status === 'confirmed';
      return p.status === f;
    });
  }

  link(id, src) { this.setState({ hover: id, hoverSrc: src }); }

  toggle(id) {
    this.setState(s => ({ sel: s.sel.indexOf(id) >= 0 ? s.sel.filter(x => x !== id) : s.sel.concat([id]) }));
  }

  renderVals() {
    const st = this.state;
    const rowsData = this.filtered();
    const isSel = id => st.sel.indexOf(id) >= 0;
    const statusLabel = { suspected: 'Suspected', confirmed: 'Confirmed', scheduled: 'Scheduled', repaired: 'Repaired' };

    const pins = st.items.map(p => {
      const linked = st.hover === p.id;
      const sel = isSel(p.id);
      let fill = 'var(--color-bg)', stroke = 'color-mix(in srgb, var(--color-text) 38%, transparent)', opacity = 1;
      if (p.status === 'confirmed') { fill = 'var(--color-accent)'; stroke = 'var(--color-accent)'; }
      if (p.status === 'scheduled') { fill = 'var(--color-accent-800)'; stroke = 'var(--color-accent-800)'; }
      if (p.status === 'repaired') { stroke = 'var(--color-neutral-300)'; opacity = 0.55; }
      const size = Math.round(12 + p.severity * 11 + (linked || sel ? 5 : 0));
      let glow = 'var(--shadow-sm)';
      if (sel) glow = '0 0 0 4px var(--color-accent-200)';
      if (linked) glow = '0 0 0 5px color-mix(in srgb, var(--color-accent) 24%, transparent)';
      return {
        left: p.x.toFixed(2) + '%', top: p.y.toFixed(2) + '%',
        size: size + 'px', fill, stroke, glow, opacity,
        z: linked ? 60 : sel ? 50 : 20,
        stopLabel: p.status === 'scheduled' ? String(p.stop) : '',
        enter: () => this.link(p.id, 'row'),
        click: () => this.toggle(p.id)
      };
    });

    const rows = rowsData.map(p => {
      const linked = st.hover === p.id;
      const sel = isSel(p.id);
      let mark = 'var(--color-neutral-400)';
      if (p.status === 'confirmed') mark = 'var(--color-accent)';
      if (p.status === 'scheduled') mark = 'var(--color-accent-800)';
      if (p.status === 'repaired') mark = 'var(--color-neutral-300)';
      const filledSegs = Math.max(1, Math.ceil(p.severity * 4));
      return {
        street: p.street,
        ref: p.ref,
        evidence: p.vehicles + (p.vehicles === 1 ? ' vehicle · ' : ' vehicles · ') + p.passes + ' passes · ' + statusLabel[p.status].toLowerCase(),
        priority: p.priority.toFixed(1),
        priColor: sel || linked ? 'var(--color-accent-800)' : 'color-mix(in srgb, var(--color-text) 70%, transparent)',
        mark,
        bg: sel ? 'var(--color-accent-100)' : linked ? 'color-mix(in srgb, var(--color-text) 5%, transparent)' : 'transparent',
        segs: [0, 1, 2, 3].map(i => ({ fill: i < filledSegs ? mark : 'color-mix(in srgb, var(--color-text) 12%, transparent)' })),
        enter: () => this.link(p.id, 'row'),
        click: () => this.toggle(p.id)
      };
    });

    const hovered = st.items.find(p => p.id === st.hover) || null;
    const linkedItem = hovered ? {
      left: hovered.x.toFixed(2) + '%', top: hovered.y.toFixed(2) + '%',
      coord: (56.47 - hovered.y / 100 * 0.03).toFixed(4) + ', ' + (-2.97 + hovered.x / 100 * 0.06).toFixed(4)
    } : false;

    const inspector = hovered ? {
      street: hovered.street + ' ' + hovered.ref,
      status: statusLabel[hovered.status],
      line1: hovered.vehicles + ' distinct vehicles · ' + hovered.passes + ' passes · last ' + hovered.lastPass,
      line2: 'Severity ' + hovered.severity.toFixed(2) + ' · age ' + hovered.age.toFixed(1) + ' months · priority ' + hovered.priority.toFixed(1),
      hint: isSel(hovered.id) ? 'In tomorrow\u2019s route. Click to remove.' : hovered.status === 'suspected' ? 'One vehicle only. A second pass by another vehicle confirms it.' : 'Click to add to tomorrow\u2019s route.'
    } : false;

    const veh = st.veh.map(v => {
      const pt = this.at(v.seg, v.t);
      return { label: v.label, left: pt[0].toFixed(2) + '%', top: pt[1].toFixed(2) + '%' };
    });

    const trails = [];
    st.veh.forEach(v => {
      for (let k = 1; k <= 5; k++) {
        const t = Math.min(1, Math.max(0, v.t - v.dir * 0.03 * k));
        const pt = this.at(v.seg, t);
        trails.push({ left: pt[0].toFixed(2) + '%', top: pt[1].toFixed(2) + '%', opacity: (0.28 - k * 0.045).toFixed(2) });
      }
    });

    const counts = { suspected: 0, confirmed: 0, scheduled: 0, repaired: 0 };
    st.items.forEach(p => counts[p.status]++);

    const filters = [
      { key: 'open', label: 'Open' },
      { key: 'suspected', label: 'Suspected' },
      { key: 'confirmed', label: 'Confirmed' },
      { key: 'scheduled', label: 'Scheduled' }
    ].map(f => ({
      label: f.label,
      click: () => this.setState({ filter: f.key }),
      bg: st.filter === f.key ? 'var(--color-accent)' : 'transparent',
      color: st.filter === f.key ? 'var(--color-bg)' : 'color-mix(in srgb, var(--color-text) 70%, transparent)',
      border: st.filter === f.key ? 'var(--color-accent)' : 'var(--color-divider)'
    }));

    const selItems = st.items.filter(p => isSel(p.id));
    const mins = selItems.length * 20 + Math.round(selItems.length * 6.5);

    return {
      authority: this.props.authority ?? 'Dundee City Council',
      liveLabel: this.props.liveFeed === false ? 'Feed paused' : '3 vehicles reporting',
      kmLabel: (148.6 + st.tick * 0.11).toFixed(1),
      dateLabel: 'Wed 2 September 2026',
      pins, rows, vehicles: veh, trails, filters,
      listRef: this.listRef,
      rowHeight: this.rowH() + 'px',
      queueCount: rowsData.length + ' of ' + st.items.length,
      linked: linkedItem,
      inspector,
      noInspector: !hovered,
      stats: [
        { value: String(counts.confirmed), label: 'Confirmed and open' },
        { value: String(counts.suspected), label: 'Awaiting a second pass' },
        { value: String(counts.scheduled), label: 'Scheduled today' }
      ],
      selLabel: selItems.length ? selItems.length + ' selected for tomorrow' : 'Nothing selected',
      selDetail: selItems.length ? '~' + mins + ' min including travel · crew Ferry Depot A' : 'Click a row or a marker to build a route',
      planDisabled: selItems.length === 0,
      clearHover: () => this.setState({ hover: null }),
      clearSel: () => this.setState({ sel: [] })
    };
  }
}

