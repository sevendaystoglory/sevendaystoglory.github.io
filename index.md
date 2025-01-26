---
layout: default
title: Home
---

# Welcome to My Site

This is the homepage of my personal website. Here you'll find my thoughts, projects, and more.

## Recent Blog Posts
{% for post in site.posts %}
  {% if post.category == 'blogs' %}
    - [{{ post.title }}]({{ post.url | relative_url }}) - {{ post.date | date: "%B %d, %Y" }}
  {% endif %}
{% endfor %}

## Today I Learned
{% for post in site.posts %}
  {% if post.category == 'til' %}
    - [{{ post.title }}]({{ post.url | relative_url }}) - {{ post.date | date: "%B %d, %Y" }}
  {% endif %}
{% endfor %}

## Projects
{% for post in site.posts %}
  {% if post.category == 'projects' %}
    - [{{ post.title }}]({{ post.url | relative_url }}) - {{ post.date | date: "%B %d, %Y" }}
  {% endif %}
{% endfor %} 