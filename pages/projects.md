---
layout: default
title: Projects
permalink: /pages/projects/
---

<section class="page-hero page-hero-storm">
  <div class="hero-text">
    <h1 class="display-name">Projects</h1>
    {% include rule.html %}
    <p class="bio">Side projects and tools.</p>
  </div>
  <div class="page-hero-art">
    <div class="scene-box"><canvas class="scene-canvas" data-scene="chaos" aria-hidden="true"></canvas></div>
    <p class="art-caption">the chaos game. start with a dot, pick one of the three corners at random, and move the dot halfway towards it. do this thousands of times, mark every place the dot lands, and the sierpinski triangle appears. the orange @ is one dot playing, the + is the corner it picked, and each colour shows which corner a dot was heading for. other jump rules draw the other fractals. click for the next one, or hover over it to bend it.</p>
  </div>
</section>

<section class="lower">
  {% include projects-list.html %}
</section>
