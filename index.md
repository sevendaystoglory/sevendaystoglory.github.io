---
layout: default
title: Home
---

# Welcome to My Site

This is the homepage of my personal website. Here you'll find my thoughts, projects, and more.

## Recent Posts

{% for post in site.posts limit:5 %}
- [{{ post.title }}]({{ post.url | relative_url }}) - {{ post.date | date: "%B %d, %Y" }}
{% endfor %} 