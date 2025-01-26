---
layout: default
title: Blogs
---

# Blog Posts

{% for post in site.posts %}
  {% if post.category == 'blogs' %}
    - [{{ post.title }}]({{ post.url | relative_url }}) - {{ post.date | date: "%B %d, %Y" }}
  {% endif %}
{% endfor %}