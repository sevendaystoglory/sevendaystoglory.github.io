---
layout: post
title: "How are ANNs different from Biological Neurons"
date: 2025-02-01
category: til
permalink: /til/anns-snns/
image: /assets/images/spikingneural.original.jpg
---

Lately I have been reading about how neurons actually compute, and I kept wondering how the artificial neurons in our models compare to the real ones in our brains. So here is what I found about how biological neurons, regular artificial neural networks (ANNs) and spiking neural networks (SNNs) are alike, and mostly how they differ. It's dense, I promise :)

---

## How Do Biological Neurons Work. And Learn?

Biological neurons are FAR more than simple binary switches. They are complex electrochemical devices that operate on both spatial(1) and temporal scales(2).

### The Core Mechanisms:
- **Structure and Signal Integration:**  
  Each neuron has a cell body (soma), dendrites, and an axon. Dendrites receive input signals -often chemical in nature - from other neurons, and the soma integrates these inputs. When the combined signal (or membrane potential) exceeds a threshold, an action potential is generated and travels down the axon.
  
- **Synaptic Transmission:**  
  At the axon terminal, the electrical impulse triggers the release of neurotransmitters into the synaptic cleft. These chemicals bind to receptors on the adjacent neuron, either exciting or inhibiting it. The nature and strength of these synaptic connections are fundamental to how information flows through neural circuits.
  
- **Synaptic Plasticity and Learning:**  
  Learning in the brain is largely a product of synaptic plasticity - the ability of synapses to change their strength. One prominent mechanism is Spike-Timing Dependent Plasticity (STDP), where the exact timing between the firing of a pre-synaptic neuron and a post-synaptic neuron determines whether a synapse is strengthened (potentiation) or weakened (depression). This precise timing is crucial; even millisecond differences can dictate the direction of synaptic change.

Put together, the wiring, the chemistry and the timing are what let the brain take in a lot of information and keep learning from what happens around it.


<img loading="lazy" decoding="async" src ="/assets/images/anns.webp" style = "max-width: 60%; height: auto">

## How Do Artificial Neural Networks (ANNs) Work. And Learn?

Artificial Neural Networks, while inspired by biology, simplify these processes dramatically.

### Architectural Overview:
- **Mathematical Abstractions:**  
  In ANNs, each “neuron” is a mathematical function that performs a weighted sum of its inputs, adds a bias, and then passes the result through an activation function (such as a sigmoid or ReLU). This abstraction takes away the temporal and chemical complexity of biological neurons. But gives us something that is rather easy to model!
  
- **Layered Structures:**  
  Neurons are organized into layers - input, hidden, and output. The network learns to map inputs to outputs by adjusting the weights and biases through a process known as backpropagation.

### The Learning Process:
- **Backpropagation and Gradient Descent:**  
  When an ANN makes a prediction, it calculates the error relative to the expected output. This error is then propagated back through the network, adjusting the weights using gradient descent. The algorithm minimizes the error over many iterations. While effective for many tasks, this method lacks the localized, time-sensitive adjustments seen in biological systems.
  
- **Static Versus Dynamic:**  
  ANNs operate on static snapshots of data. They don’t naturally account for the timing of individual activations, which means they miss out on the temporal richness that biological neurons exploit for learning and memory.

ANNs have done amazing things in vision and language, but they leave out the timing and the chemistry that real neurons depend on.

---

## A Better Emulation: Spiking Neural Networks (SNNs)

<img loading="lazy" decoding="async" src ="/assets/images/spikingneural.original.jpg" style = "max-width: 60%; height: auto">

Spiking Neural Networks attempt to bridge the gap between the highly abstracted world of ANNs and the messy, yet efficient, operations of biological brains.

### What Makes SNNs Different:
- **Temporal Coding with Spikes:**  
  Unlike ANNs, SNNs communicate using discrete spikes rather than continuous values. In these networks, the timing of each spike carries information, providing a natural way to encode temporal data..
  
- **Event-Driven Computation:**  
  SNNs process information only when spikes occur. This event-driven approach mirrors the brain's strategy, potentially reducing energy consumption and computational overhead - key advantages for neuromorphic hardware.
  
- **Incorporation of Biological Realism:**  
  Models of SNNs include features like the refractory period (a brief period after a spike during which a neuron cannot fire again) and the dynamics of membrane potential. These elements add layers of realism that are completely absent in traditional ANNs.

SNNs are still an active area of research, but they represent a promising direction for making artificial systems that not only mimic the structure of biological brains but also emulate their dynamic behavior more faithfully.

---

## Benefits of SNNs

There are several compelling advantages to pursuing spiking models over traditional ANNs:

- **Energy Efficiency:**  
  Since SNNs compute only when necessary (i.e., on the occurrence of spikes), they naturally consume less energy. This is particularly beneficial for low-power applications and for hardware designed to mimic neural architectures.
  
- **Enhanced Temporal Processing:**  
  The ability to process information based on spike timing allows SNNs to handle sequential and time-varying data more effectively. This is a significant edge in tasks like auditory processing, event-based vision, and robotics.
  
- **Closer Alignment with Biological Systems:**  
  By incorporating elements such as STDP and refractory dynamics, SNNs offer insights into the biological processes of learning and adaptation. This not only enriches our understanding of the brain but may also lead to more robust and adaptable AI.
  
- **Potential for Unsupervised Learning:**  
  Some SNN models can learn from unlabelled data through mechanisms akin to those used by the brain, potentially reducing the reliance on large, curated datasets required by supervised learning methods.

So SNNs might lead to AI that uses less energy and works more like the brain, and that could beat regular ANNs on tasks where timing and energy matter.

---

## How Do Spiking Neural Networks Learn?

Learning in SNNs is an evolving field that combines principles from both neuroscience and machine learning.

### Key Learning Mechanisms:
- **Spike-Timing Dependent Plasticity (STDP):**  
  Much like in biological systems, STDP in SNNs adjusts synaptic weights based on the precise timing between spikes. If a pre-synaptic neuron fires shortly before a post-synaptic neuron, the connection is strengthened; if the order is reversed, the connection weakens. This mechanism allows the network to self-organize based on the temporal structure of the input.
  
- **Surrogate Gradient Techniques:**  
  One of the challenges with SNNs is that the spiking mechanism is non-differentiable, complicating the application of traditional backpropagation. Researchers have developed surrogate gradient methods that approximate the gradients during training, enabling SNNs to be optimized effectively while retaining their spiking behavior.
  
- **Hybrid Learning Approaches:**  
  Some research attempts to combine backpropagation with local learning rules like STDP, aiming to harness the advantages of both global error minimization and local, time-dependent plasticity. This hybrid approach is still in its infancy but holds promise for training more complex spiking networks.

An in-depth discussion on these methods is available in recent studies, including a preprint on arXiv that delves into various algorithms and experimental results demonstrating the potential of SNNs in practical tasks.

---

## Final Thoughts

Comparing the three matters for where AI goes next. ANNs have already changed a lot of fields, but they ignore timing and most of the biology, and that holds them back. SNNs care about when a spike happens, only do work when something happens, and stay closer to how the brain works, so they might be the next big step.

What I keep wondering is whether we can borrow the brain's efficiency and its knack for adapting to build better machines. As these models improve, the line between biological and artificial computation may get blurrier, and I find that exciting.

If you have thoughts on SNNs, or on whether the messy, dynamic brain should shape the next generation of AI, I would love to hear them. My email is in the sidebar.



*Sources:*  
: [Nature article on neuronal dynamics](https://www.nature.com/articles/s41598-021-84813-6)   
: [ArXiv preprint on spiking neural network learning](https://arxiv.org/pdf/1804.08150)
