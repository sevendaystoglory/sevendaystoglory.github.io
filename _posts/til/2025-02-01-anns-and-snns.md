---
layout: post
title: "How are ANNs different from Biological Neurons"
date: 2025-02-01
category: til
permalink: /til/anns-snns
image: /assets/images/spikingneural.original.jpg
---

# How are ANNs different from Biological Neurons
<p class="post-date">Feb 1, 2025</p>

I've been digging deep into the mechanics of neural computation lately, and one question keeps coming up: How do the artificial neurons in our models really compare to the biological neurons firing in our brains? Today, I’m cutting through the hype to give you a content-rich breakdown (I promise :) of the similarities and, more importantly, the differences between biological neurons, traditional artificial neural networks (ANNs), and spiking neural networks (SNNs).

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

This intricate interplay of structure, chemistry, and timing is what allows biological systems not only to process vast amounts of information but also to adapt and learn from their environment in a highly dynamic way.


<img src ="/assets/images/anns.png" style = "max-width: 60%; height: auto">

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

Although ANNs have driven breakthroughs in fields ranging from computer vision to natural language processing, they are fundamentally divorced from the time-dependent dynamics and complex biochemical processes that underlie real neural computation.

---

## A Better Emulation: Spiking Neural Networks (SNNs)

<img src ="/assets/images/spikingneural.original.jpg" style = "max-width: 60%; height: auto">

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

These benefits suggest that SNNs might provide a pathway to more efficient and biologically plausible AI systems. Systems that could outperform traditional ANNs in tasks where timing and energy efficiency are crucial.

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

The comparison between biological neurons, traditional ANNs, and SNNs isn’t just academic - it has real implications for the future of artificial intelligence. While ANNs have already revolutionized many fields, their lack of temporal dynamics and biological nuance is a significant limitation. SNNs, with their emphasis on spike timing, event-driven computation, and closer adherence to biological principles, may well be the next leap forward.

This exploration isn’t merely theoretical. It pushes us to ask: Can we harness the brain’s inherent efficiency and adaptability to build smarter, more resilient machines? As research continues to refine these models and overcome current challenges, the line between biological and artificial computation may blur further, opening exciting new possibilities in AI.

I invite you to dive into the details and share your perspectives. What aspects of SNNs do you find most compelling? Do you see a future where the messy, dynamic nature of the brain informs the next generation of AI? Let’s discuss in the comments.



*Sources:*  
: [Nature article on neuronal dynamics](https://www.nature.com/articles/s41598-021-84813-6)   
: [ArXiv preprint on spiking neural network learning](https://arxiv.org/pdf/1804.08150)
