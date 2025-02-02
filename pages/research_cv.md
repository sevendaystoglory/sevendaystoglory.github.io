---
layout: post
title: "CV - Mohammad Areeb"
date: 2025-01-18
category: cv
permalink: /mohammad-areeb-cv/
---

<!-- Inline CSS for a traditional university-style look -->
<style>
  .cv-container {
    font-family: "Times New Roman", Georgia, Times, serif;
    margin: 0 auto;
    width: 90%;
    max-width: 800px;
    line-height: 1.5;
    font-size: 12px;  /* overall smaller font size */
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .header-left {
    text-align: left;
  }
  .header-left h1 {
    margin: 0;
    font-size: 24px;
    letter-spacing: 1px;
  }
  .header-left p {
    margin: 5px 0;
    font-size: 12px;
  }
  .download-link a {
    text-decoration: underline;
    font-size: 12px;
    color: #007BFF;
  }
  .cv-section {
    margin-bottom: 20px;
    text-align: left;
  }
  .cv-section h2 {
    font-size: 16px;
    text-transform: uppercase;
    border-bottom: 1px solid #007BFF;
    padding-bottom: 3px;
    margin-bottom: 8px;
  }
  .cv-entry {
    margin-bottom: 10px;
  }
  .cv-entry-title {
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 2px;
  }
  .cv-entry-meta {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin-bottom: 3px;
  }
  .cv-entry ul {
    margin-top: 3px;
    margin-left: 20px;
    font-size: 12px;
  }
  table.cv-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    font-size: 12px;
  }
  table.cv-table th,
  table.cv-table td {
    padding: 6px;
    border: 1px solid #ccc;
    text-align: left;
  }
  table.cv-table th {
    background-color: #f0f0f0;
  }
</style>

<div class="cv-container">

  <!-- Header / Name / Contact with Download CV link to the right -->
  <div class="header">
    <div class="header-left">
      <h1>MOHAMMAD AREEB</h1>
      <p>
        <span>📱 +91-8750613642</span> | 
        <span>✉️ <a href="mailto:mohd.areeb02@gmail.com" style="color: inherit; text-decoration: none;">mohd.areeb02@gmail.com</a></span> | 
        <span><a href="#" style="color: inherit; text-decoration: none;">/Mohammad Areeb</a></span>
      </p>
    </div>
    <div class="download-link">
      <a href="MohammadAreeb_CV.pdf" download>Download CV</a>
    </div>
  </div>

  <!-- Education -->
  <div class="cv-section" id="education">
    <h2>Education</h2>
    <table class="cv-table">
      <thead>
        <tr>
          <th>Year</th>
          <th>Degree / School</th>
          <th>Institute</th>
          <th>GPA / %age</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="text-align: right;">2020 - Present</td>
          <td>B.Tech in Mathematics and Computing</td>
          <td>Indian Institute of Technology, Delhi</td>
          <td>8.45</td>
        </tr>
        <tr>
          <td style="text-align: right;">2020</td>
          <td>Sr. Secondary School</td>
          <td>Delhi Public School, RK Puram</td>
          <td>96.6</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Research Interests -->
  <div class="cv-section" id="research-interests">
    <h2>Research Interests</h2>
    <p>
      Algorithms, Machine Learning, Intelligent Systems, Inverse Reinforcement Learning, Robotics and Path Planning, 
      Explainable AI, Computer Vision, Medical Image Processing, Differential Privacy, Computational Social Choice
    </p>
  </div>

  <!-- Research Exposure -->
  <div class="cv-section" id="research-exposure">
    <h2>Research Exposure</h2>

    <!-- OLED Lifetime -->
    <div class="cv-entry">
      <div class="cv-entry-title">OLED Lifetime: Accelerated Data Collection and Analysis</div>
      <div class="cv-entry-meta">
        <div>Major Design Project, Prof. Madhusudan Singh (Dept. of Electrical Engg, IITD)</div>
        <div style="font-style: italic;">Apr’23 – Present</div>
      </div>
      <ul>
        <li>Designed, fabricated and operationalized a compact, self contained 3D enclosure measurement setup for monitoring light emission intensity from an array of LEDs being driven under programmable DC current bias.</li>
        <li>Established a Wi-Fi-enabled real-time data collection framework and cloud storage integration via Rasp Pi.</li>
        <li>Applied statistical models to perform L70 measurements; STATPAC to approximate s-confidence intervals.</li>
        <li>Current Work: Building models for the distribution of life as a function of constant stress, models for the effect of size on life, models for the cumulative effect of exposure in step-stress testing; reducing digital noise in ADC.</li>
        <li>[To be submitted in American Journal of Physics in Dec’23]</li>
      </ul>
    </div>

    <!-- Automated UTI Pathogen Detection -->
    <div class="cv-entry">
      <div class="cv-entry-title">Automated UTI Pathogen Detection</div>
      <div class="cv-entry-meta">
        <div>Research Intern, Prof. Wouter Metsola (Micro and Nano systems, KTH)</div>
        <div style="font-style: italic;">Jun’23 – Aug’23</div>
      </div>
      <ul>
        <li>Implemented an automated system for rapid detection and quantification of UTI-bacteria via digital biosensors.</li>
        <li>Developed Scale and Rotation Invariant Template Matching algorithm; enhanced the precision of dipstick well detection under variable lighting conditions; Applied CLAHE for superior color differentiation within wells.</li>
        <li>Deployed shadow removal method by contrast stretching, enabling the accurate study of surface characteristics.</li>
      </ul>
    </div>

    <!-- Enhanced Payment Fraud Detection -->
    <div class="cv-entry">
      <div class="cv-entry-title">Enhanced Payment Fraud Detection via Deep Reinforcement Learning</div>
      <div class="cv-entry-meta">
        <div>Research Intern, Prof. Dhiman Mallick (Dept. of Electrical Engg, IITD)</div>
        <div style="font-style: italic;">Jun’23 – Jul’23</div>
      </div>
      <ul>
        <li>Trained a DQN agent by experience replay with tunable reward function for the detection of payment fraud.</li>
        <li>Showcased superior performance of epsilon-greedy policy over supervised models on the FI score. Leveraged performance by developing a framework for prioritizing experiences using a novel Sum-Tree data structure.</li>
        <li>Integrated Double DQN agent with Stochastic Prioritization and annealed the bias using Importance sampling.</li>
      </ul>
    </div>

    <!-- Statistical and ML Forecasts in Energy Market -->
    <div class="cv-entry">
      <div class="cv-entry-title">Statistical and ML based Forecasts in Energy Market</div>
      <div class="cv-entry-meta">
        <div>Research Fellowship, SURA–2022, Prof. V.V.K. Srinivas Kumar (Dept. of Mathematics, IITD)</div>
        <div style="font-style: italic;">Jun’22 – Aug’22</div>
      </div>
      <ul>
        <li>Enhanced financial risk management for energy trading at IEX via precise day-ahead market price forecasting.</li>
        <li>Utilized Hyndman-Khandakar Algorithm for optimal seasonal ARIMA modelling; deployed GARCH model for measuring volatility clustering; Identified SARIMAX-GARCH as the best model with a MAPE of ~3%.</li>
        <li>Validated superior medium-term forecast accuracy of LSTM network over all statistical techniques.</li>
      </ul>
    </div>

    <!-- Approximation of Elliptic Eigenvalue Problems -->
    <div class="cv-entry">
      <div class="cv-entry-title">Approximation of Elliptic Eigenvalue Problems</div>
      <div class="cv-entry-meta">
        <div>IIT Delhi, India</div>
        <div style="font-style: italic;">May’22 – Jul’22</div>
      </div>
      <ul>
        <li>Attempted to approximate solutions for second-order Variationally Formulated Elliptic Eigenvalue Problem.</li>
        <li>Analyzed and presented proofs of Abstract spectral approximation results in the theory of Babuska and Osborn; Tailored Finite Element Method to approximate solutions to the Laplace Eigenvalue Problem.</li>
      </ul>
    </div>
  </div>

  <!-- Projects -->
  <div class="cv-section" id="projects">
    <h2>Projects</h2>

    <!-- Neural Contextual Multi Armed Bandit -->
    <div class="cv-entry">
      <div class="cv-entry-title">Neural Contextual Multi Armed Bandit Algorithms</div>
      <div class="cv-entry-meta">
        <div>Course Project, Prof. Anup Chattopadhyay (Dept. of Electrical Engg, IITD)</div>
        <div style="font-style: italic;">Aug’23 – Nov’23</div>
      </div>
      <ul>
        <li>Conceived and implemented extensive literature review of existing algorithms for the Stochastic Contextual Bandit Problem. Implemented Neural UCBoost algorithm with Thompson Sampling for real-time bandits, matching the LinUCB’s O(√T) regret bound.</li>
        <li>Simulated the Mabus Algorithm for Multi-facet Contextual Bandit on real-world datasets to evaluate efficiency.</li>
      </ul>
    </div>

    <!-- EYE-PERS -->
    <div class="cv-entry">
      <div class="cv-entry-title">EYE-PERS, Personalized Eyewear Recommendation System</div>
      <div class="cv-entry-meta">
        <div>Warspeed, Generative AI Hackathon by LightSpeed</div>
        <div style="font-style: italic;">May’23</div>
      </div>
      <ul>
        <li>Pioneered an eyewear recommendation app using Meta’s Segment Anything; 300+ item catalog; SDXL for image generation; Integrated GPT-3.5 powered conversational chatbot, enhancing user decisions with semantic search, better eyewear choices.</li>
        <li>Secured 8th position from among 65 finalists across India; Extended fellowship opportunity at Dev Folio.</li>
      </ul>
    </div>

    <!-- Discrete Event Process Scheduling Simulator -->
    <div class="cv-entry">
      <div class="cv-entry-title">Discrete Event Process Scheduling Simulator</div>
      <div class="cv-entry-meta">
        <div>Course Project, Prof. Manideep B (Dept. of Mathematics, IITD)</div>
        <div style="font-style: italic;">Aug’23 – Sep’23</div>
      </div>
      <ul>
        <li>Designed and implemented a custom-built simulator for randomly generated events with exponentially distributed interarrival time. Integrated complex scheduling algorithms including FCFS, RR, SJF, SRTF, MFLO and created Gantt charts for visual evaluation of metrics like Turnaround Time and Average Response Time.</li>
      </ul>
    </div>

    <!-- LSTM-Enhanced AI for Atari Pong -->
    <div class="cv-entry">
      <div class="cv-entry-title">LSTM-Enhanced AI for Atari Pong Trajectory Prediction</div>
      <div class="cv-entry-meta">
        <div>Course Project, Prof. Aryan Chattopadhyay (Dept. of Electrical Engg, IITD)</div>
        <div style="font-style: italic;">Jan’23 – Apr’23</div>
      </div>
      <ul>
        <li>Developed and enhanced advanced Deep Reinforcement Learning architectures - Deep SARSA and Deep Q Learning with LSTM integration, significantly boosting Atari Pong agent performance in trajectory prediction.</li>
        <li>Performed extensive experimental validation and comparative study of rewards with Mann-Whitney U statistics.</li>
      </ul>
    </div>

    <!-- DSCoin -->
    <div class="cv-entry">
      <div class="cv-entry-title">DSCoin: A Completely Decentralized Cryptocurrency</div>
      <div class="cv-entry-meta">
        <div>Course Project, Prof. Amitabha Bagchi and Venkata Koppula (Dept. of Comp Sc, IITD)</div>
        <div style="font-style: italic;">Aug’21 – Nov’21</div>
      </div>
      <ul>
        <li>Designed and created a Java-based decentralized cryptocurrency with Authenticated Data Structures and blockchain for secure 6-bit coin transactions. Utilized Collision Resistant Functions and Digital Signatures for validation.</li>
        <li>Ensured integrity by employing a Merkle tree for blockchain organization and mining on the longest valid chain to mitigate malicious activities.</li>
      </ul>
    </div>
  </div>

  <!-- Achievements & Certifications -->
  <div class="cv-section" id="achievements">
    <h2>Achievements & Certifications</h2>
    <ul>
      <li>Secured All India Rank of 469 out of 12 lakh candidates in JEE Mains 2020, conducted by NTA.</li>
      <li>Scored 97.3 percentile in IIT-JEE Advanced 2020 among 1.67 lakh candidates, conducted by IIT Delhi.</li>
      <li>Secured 6th Position out of 35 selected teams across India in Warspeed, a Gen AI competition, by LightSpeed.</li>
      <li>Poster presentation certificate at International Conference on Applied Science, Mathematics and Statistics.</li>
    </ul>
  </div>

  <!-- Technical Skills -->
  <div class="cv-section" id="skills">
    <h2>Technical Skills</h2>
    <p><strong>Programming</strong>: C, C++, Java, Python, Rust, R, Verilog, MATLAB</p>
    <p><strong>Developer Tools</strong>: ImageJ, Jupyter Notebook, Eclipse, Google Colab, VS Code, RStudio, Quartus, EAG</p>
    <p><strong>Libraries and Frameworks</strong>: Git, Pytorch, Tensorflow, OpenCV, RPi, STATA, STATPAC</p>
  </div>

  <!-- Key Courses Undertaken -->
  <div class="cv-section" id="courses">
    <h2>Key Courses Undertaken</h2>
    <p><strong>Mathematics</strong>: Calculus, Advanced Linear Algebra, Abstract Algebra, Discrete Mathematical Structures, Real & Complex Analysis, Functional Analysis, Cryptography, Probability & Stochastic Processes, Statistical Methods, Optimization Methods and Applications, Computing Laboratory, Differential Equations, Numerical Methods & Computation, Comp. Methods for Differential Equations</p>
    <p><strong>Computer Science</strong>: Intro. to Computer Science (C++), Data Structures & Algorithms (Java), Computer Architecture, Analysis and Design of Algorithms, Intro. to Automata and Theory of Computation, Data Mining, Operating System, Digital Electronics</p>
    <p><strong>Artificial Intelligence</strong>: Stochastic Control and Reinforcement Learning, Bandit Algorithms, Online Prediction and Online Convex Optimization</p>
    <p><strong>Electronics</strong>: [Courses covering device-level design and embedded systems]</p>
  </div>

  <!-- Leadership Experience and Community Service -->
  <div class="cv-section" id="leadership">
    <h2>Leadership Experience & Community Service</h2>
    <ul>
      <li><strong>Teaching Assistant, course MTL104 (Linear Algebra and Applications, Fall 2023)</strong>: Organized tutorials, crafted creative problems of the week and graded assignments under Prof. Biplab Basak for a 170 student section.</li>
      <li><strong>Buddy Mentor and Guide, Samsung Solve For Tomorrow (July’23)</strong>: Led a team of 3 students for startup pitching, out of 30 selected participants from across India in a 5 day bootcamp, conducted by Samsung R&D.</li>
      <li><strong>NSS Mentor (Jan’22 – Apr’22)</strong>: Taught ‘Probability and Statistics’ to a final year BSc underprivileged student for degree exams, an initiative by NSS, IIT Delhi.</li>
    </ul>
  </div>

</div>
