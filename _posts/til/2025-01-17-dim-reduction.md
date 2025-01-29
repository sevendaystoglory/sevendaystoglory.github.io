---
layout: post
title: "How to dimensionally reduce data for the purposes of visualization"
date: 2025-01-17
category: til
permalink: /til/dimensional-reduction
image: /assets/images/arxiv-papers.png
---

# How to dimensionally reduce data for the purposes of visualization
<p class="post-date">Jan 17, 2025</p>


## There are generally the following ways to reduce high dimensional data:
- [ ] PCA - linear dimensionality reduction using a global covariant matrix
- [ ] UMAP - Uniform Manifold Approximation and Projection
- [ ] SVD - Singular Value Decomposition
- [ ] t-SNE (t-Distributed Stochastic Neighbor Embedding)

## How does t-SNE work?

Given a set of points in high dimension space, t-SNE seeks to _preserve the local relationship between points_. It achieves this by measuring the similarity among high dimensional points and representing this similarity as probabilities. Then it constructs a similar distribution of probabilities in lower dimensional space and uses ML to minimize the difference between the two. 

<a href="https://medium.com/@sachinsoni600517/mastering-t-sne-t-distributed-stochastic-neighbor-embedding-0e365ee898ea">This</a> is a rather good blog on how t-SNE works and how is similarity calculated among high dimensional points.

<img src="/assets/images/arxiv-papers.png" width="800" style="max-width: 100%; height: auto;">

*t-SNE visualization of a small subset of human knowledge (from <a href="https://paperscape.org/">paperscape</a>). Each circle is an arxiv paper and size indicates the number of citations. Sourced from - <a href="https://karpathy.github.io/2016/09/07/phd/">Karpathy's Blog</a>*