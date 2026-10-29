---
layout: default
title: Home
---

<section class="intro-card" id="hero">
  <div class="intro-text">
    <p class="bio">
      I'm an MS student at <a href="https://mila.quebec/">Mila</a>, advised by
      <a href="https://sarathchandar.in/">Dr.&nbsp;Sarath Chandar</a> and co-supervised by
      <a href="https://scholar.google.ca/citations?hl=en&user=lqDGv9YAAAAJ">Dr.&nbsp;Amal Zouaq</a>.
      I work on <strong>continual learning</strong>, <strong>AI alignment</strong> and the
      <strong>optimization of deep neural nets</strong>.
    </p>
    <p class="bio">
      Much of my perspective on these topics has come through the <strong>geometry of deep
      learning</strong>, i.e. what the optimizer and the loss landscape govern about what gets
      learned, how a network can keep learning (loss of information plasticity), and how to make
      LLMs trustworthy through data attribution. I am always open to collaborations, so feel free
      to reach out.
    </p>
    <p class="bio">
      Previously, I worked on building AI-native video infra and specifically visual information
      retrieval with <a href="https://abhinavsh.info/">Dr.&nbsp;Abhinav Shrivastava</a>, on
      trustworthy LLMs via data attribution with
      <a href="https://prathosh.in/">Dr.&nbsp;Prathosh A.P.</a> at IISc
      Bangalore, and on test-time alignment at Purdue with
      <a href="https://beerkay.github.io/">Dr.&nbsp;Berkay Celik</a>; I also worked with
      <a href="https://pengtaoxie.github.io/">Dr.&nbsp;Pengtao Xie</a> at UCSD on predicting histone
      signatures of non-coding RNAs. I graduated in Physics from IIT Delhi (2024)
      with a bachelor's thesis in computational neuroscience.
    </p>
    <p class="bio">
      Outside of research, I enjoy gesture drawing, digital art and design.
    </p>
    <div class="bio-note">Open to research internships for summer 2027.</div>
  </div>
  <div class="intro-art">
    <div class="card-art card-art-ascii">
      <canvas class="ascii-canvas" id="ascii-landscape" aria-label="An animated loss landscape"></canvas>
    </div>
    <p class="card-art-hint art-caption">a loss landscape contour with points (@) actively running gradient descent on it. move across to shape it and click to drop another point.</p>
  </div>
</section>

<section class="lower" id="publications">
  <div class="section-head">
    <h2 class="section-title">Selected Publications and Preprints</h2>
    {% include rule.html small=true %}
  </div>
  {% include publications-list.html service=true %}
</section>

<div class="latest-layout">
<div class="latest-main">
<section class="news-sec" id="news" aria-label="News">
  <div class="section-head">
    <h2 class="section-title">News</h2>
    {% include rule.html small=true %}
  </div>
  {% include news-list.html %}
</section>

<section class="lower" id="writing">
  <div class="section-head">
    <h2 class="section-title">Writing / TIL</h2>
    {% include rule.html small=true %}
  </div>
  {% include writing-list.html %}
</section>
</div>
<div class="cloud-art" aria-hidden="true">
  <canvas id="ascii-clouds"></canvas>
</div>
</div>

<section class="lower" id="projects">
  <div class="section-head">
    <h2 class="section-title">Projects</h2>
    {% include rule.html small=true %}
  </div>
  {% include projects-list.html %}
</section>
