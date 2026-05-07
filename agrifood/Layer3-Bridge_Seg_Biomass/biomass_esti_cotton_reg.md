# Literature Review — *Use of synthetic images for training a deep learning model for weed detection and biomass estimation in cotton* (Scientific Reports, 2022)

## Citation
Sapkota et al., **“Use of synthetic images for training a deep learning model for weed detection and biomass estimation in cotton”**, *Scientific Reports* 12, 19580 (2022). :contentReference[oaicite:0]{index=0}

---

## High-level summary

- ❌ **Not tomato**
- ❌ **Not organ segmentation for tomato plants**
- ❌ **No direct biomass ground truth for tomato organs (leaf/stem/fruit)**
- ✅ **Very useful as a pipeline reference for [segmentation → biomass] estimation**
- ✅ **Strong evidence that segmentation-derived area can predict biomass**
- ✅ **Very useful if you want to reduce annotation burden using synthetic images**
- ⚠️ **Only indirectly useful for your agrifood project**
- ⚠️ **Biomass here is weed above-ground dry biomass, not tomato organ biomass**

---

## One-paragraph verdict

This paper is **not a direct match** for your tomato organ-classification project, because it studies **weed detection/segmentation in cotton fields**, not tomato organ parsing. However, it is still **quite useful methodologically** because it explicitly tests a pipeline where **instance segmentation outputs are converted into biomass estimates**, and it shows that **canopy mask area is better than bounding box area for biomass prediction**. That makes it a strong **supporting reference** for the idea that segmentation output can serve as a bridge to biomass estimation, which is highly relevant to your project design. 

---

# What the paper is about

The paper has two main goals:

1. test whether **synthetic images** can train a deep learning model for weed detection/segmentation  
2. test whether the **segmentation results** can be used to estimate **above-ground biomass** of individual weeds :contentReference[oaicite:3]{index=3}

That second point is the main reason this paper matters for you.

---

# Why this paper is useful for your project

## 1. It supports the idea of breaking the project into stages

This paper basically follows the kind of structure you were talking about:

- image data
- detection / segmentation
- geometric output from masks
- biomass regression

That is very close to your proposed logic:

- tomato image
- organ segmentation
- organ-specific measurements
- biomass estimation

So even though the biological target is different, the **project architecture is highly relevant**. :contentReference[oaicite:4]{index=4}

---

## 2. It gives evidence that segmentation is more useful than coarse detection for biomass

The authors compared **bounding box area** versus **canopy mask area** for biomass estimation, and found that the **canopy mask area predicted biomass better**. In the abstract they report \(R^2\) values of **0.66** and **0.46** for mask-based biomass prediction for the two weed groups, and later explain that mask area was a better estimator than bounding box area because boxes overestimate plant area. :contentReference[oaicite:5]{index=5} :contentReference[oaicite:6]{index=6}

This is important for your project because it supports the idea that:

- **segmentation is worth doing**
- a simple whole-object box is likely too crude
- organ masks may provide a much better basis for biomass estimation than global image-level features alone

So for your tomato work, this paper argues **in favor of segmentation before biomass estimation**.

---

## 3. It supports a simple 2D image-based biomass approach

The paper explicitly discusses that 3D methods like LiDAR or volume reconstruction can be more accurate, but they are also more computationally expensive; the paper instead explores a simpler **2D approach using coverage / mask area** for biomass estimation. :contentReference[oaicite:7]{index=7}

That matters because your project may reasonably start with:

- RGB image
- semantic segmentation
- area / shape / length features
- regression to biomass

This paper helps justify that a **2D image-based baseline is scientifically reasonable** before moving to harder 3D methods.

---

## 4. It is useful if annotation is expensive

A big theme of the paper is that deep learning needs lots of labeled data, and the authors try to reduce that burden using **synthetic images** made from clipped plant instances. They show that synthetic images can work surprisingly well, and that around **40–50 plant instances** were enough to generate synthetic images with near-optimal performance. :contentReference[oaicite:8]{index=8} :contentReference[oaicite:9]{index=9} :contentReference[oaicite:10]{index=10}

For your project, this is useful if:

- tomato organ masks are hard to label
- you only have a small dataset
- you want to bootstrap training data

So while not directly about tomato organs, it gives you a **data strategy idea**.

---

# Why this paper is **not** a direct match

## 1. The biological target is wrong for your main goal

The paper studies:

- cotton fields
- weeds
- weed species classes

not:

- tomato plants
- tomato organs
- leaf/stem/fruit segmentation within one tomato plant

The classes in training were **cotton, morningglories, and grass**, which is a very different labeling problem from organ-level tomato segmentation. :contentReference[oaicite:11]{index=11} :contentReference[oaicite:12]{index=12}

So you **cannot cite this as direct evidence for tomato organ classification**.

---

## 2. Biomass target is whole-individual weed biomass, not organ biomass

The biomass measurements were obtained by clipping individual weeds, drying them at **60 °C for 48 h**, and measuring **dry biomass**. :contentReference[oaicite:13]{index=13}

That means the prediction target is:

- whole above-ground biomass of each weed individual

not:

- leaf biomass
- stem biomass
- fruit biomass
- organ allocation within a tomato plant

So this paper helps you justify **segmentation-to-biomass** in general, but **not organ-wise tomato biomass estimation specifically**.

---

## 3. It does not solve your “whole tomato plant into organs” problem

The paper uses **instance segmentation** to separate plant objects in a field scene. Your task is more like **semantic organ segmentation** within a single plant. These are related but not identical problems.

Their setup is:
- detect different plant instances/classes in the scene

Your setup is:
- decompose one tomato plant into **leaf / stem / fruit**

So the learning target and annotation structure are both different.

---

# Methods used in the paper

## Imaging / hardware setup

The authors collected high-resolution RGB aerial imagery using:

- **100-megapixel FUJIFILM GFX100** medium format mirrorless RGB camera
- mounted on a **Hylio AG-110** multicopter drone
- flight height: **4.9 m**
- speed: **0.61 m/s**
- lens: **FUJIFILM GF 32–64 mm f/4 R LM WR**
- focal length: **64 mm**
- shutter speed: **1/4000 s**
- ISO: **1250**
- f-stop: **8**
- image format: **PNG**
- bit depth: **16-bit**
- spatial resolution: **0.0274 mm/pixel** at that flight height :contentReference[oaicite:14]{index=14}

### Relevance to your project
This is a **very high-resolution field phenotyping setup**, but it is UAV-based and field-focused, not a close-range greenhouse tomato organ imaging system. So it is useful as a phenotyping example, but not necessarily as the imaging setup you would copy.

---

## Biomass ground truth collection

They used **15 quadrats (1 m²)**, clipped weeds at ground level, stored each plant separately, and measured **dry biomass** after oven-drying at **60 °C for 48 h**. In total they collected:

- 60 morningglories + 60 grasses in 2020
- 39 morningglories + 44 grasses in 2021 :contentReference[oaicite:15]{index=15}

### Relevance to your project
This is useful because it shows a real workflow for linking **image instance** ↔ **physical biomass measurement**. You may need a similar paired data collection design for tomato organs.

---

## Synthetic image generation

They created synthetic images by:

- clipping plant instances from real images
- applying random modifications:
  - rotation
  - scaling
  - hue/saturation changes
- pasting them onto soil backgrounds
- generating annotations automatically in JSON format :contentReference[oaicite:16]{index=16}

They tested:
- row-oriented vs random placement
- different instance pool sizes
- manual vs automatic clipping
- real clipped plants vs GAN-generated fake plants
- synthetic-only vs mixed real+synthetic training :contentReference[oaicite:17]{index=17} :contentReference[oaicite:18]{index=18} :contentReference[oaicite:19]{index=19}

### Relevance to your project
This part is useful if you later want to generate synthetic tomato training data for:
- leaf/stem/fruit masks
- controlled scene augmentation
- low-label training

---

## Deep learning model

They used **Mask R-CNN** for weed detection and segmentation. The implementation used:

- **Detectron2**
- **PyTorch-based modular object detection library**
- transfer learning from a pre-trained model
- **ResNet101** backbone
- input images of **2048 × 2048**
- 3 classes
- 50,000 epochs/iterations setting as listed in their table
- base learning rate **0.001** :contentReference[oaicite:20]{index=20} :contentReference[oaicite:21]{index=21}

### Relevance to your project
Mask R-CNN is more naturally an **instance segmentation** choice. For your tomato organ problem, you may prefer:
- U-Net
- DeepLab
- SegFormer
for semantic segmentation

But Mask R-CNN is still relevant if you later want **instance-level leaf or fruit separation**.

---

## GAN component

For fake plant generation, they used:

- **StyleGAN2-ADA**
- NVIDIA official TensorFlow implementation
- transfer learning from pre-trained model **ffhq256** :contentReference[oaicite:22]{index=22}

### Relevance to your project
This is interesting, but in this paper the GAN-generated fake plants performed worse than real clipped plant-based synthetic images. So for your project, it suggests:
- start with **real-image-based augmentation/synthesis**
- do not assume GAN-based synthesis will automatically help

---

# Main results

## 1. Synthetic images can work fairly well

The abstract says synthetic image training based on real plant instances achieved performance comparable to real image datasets, though still lower overall:
- synthetic dataset: **mask mAP 0.60**, **bbox mAP 0.64**
- real dataset: **mask mAP 0.80**, **bbox mAP 0.81** :contentReference[oaicite:23]{index=23}

### Interpretation
Synthetic data can be useful, but it is not magic. It can supplement training, especially when labels are scarce.

---

## 2. Mixed real + synthetic did not help much here

The mixed dataset gave:
- **no gain for mask segmentation**
- only a **small gain for bounding box** performance :contentReference[oaicite:24]{index=24}

### Interpretation
If your real dataset is already diverse enough, synthetic data may not add much. So for tomato, synthetic data is more likely to help when your real labeled data are limited.

---

## 3. Around 40–50 instances were enough for good synthetic generation

The authors report that about **40–50 plant instances** were sufficient for generating synthetic images that gave near-optimal performance. :contentReference[oaicite:25]{index=25} :contentReference[oaicite:26]{index=26}

### Interpretation
This is useful for your data collection planning. You may not need hundreds of manually clipped examples before synthetic augmentation starts to become helpful.

---

## 4. Automatic clipping was comparable to manual clipping

They report automatic clipping performed similarly to manual clipping, while being much faster:
- manual clipping: about **170 min** for 150 plant instances
- automatic clipping: about **5 min**
- roughly **34× faster** :contentReference[oaicite:27]{index=27}

### Interpretation
For tomato organ segmentation, if you can design a decent auto-extraction / mask refinement pipeline, it could save huge annotation effort.

---

## 5. GAN-derived fake plants were worse

GAN-based fake plant synthetic images did **not** perform as well as real plant-derived synthetic images. The authors suggest limited training sample size may be one reason. :contentReference[oaicite:28]{index=28} :contentReference[oaicite:29]{index=29}

### Interpretation
Do not over-prioritize fancy GAN data synthesis too early.

---

## 6. Mask area was better than box area for biomass estimation

This is the key result for you. The paper concludes that weed segmentation output, specifically **canopy mask area**, can be a good estimator of biomass, especially for broadleaved weeds. :contentReference[oaicite:30]{index=30}

### Interpretation
For your tomato pipeline, this strongly supports:
- mask-level organ quantification
- extracting organ area/shape/length features
- doing regression from those features to biomass

---

# Direct usefulness to your tomato agrifood project

## What transfers well

### ✅ Strongly transferable ideas
- segmentation outputs can be used for biomass estimation
- mask area is more informative than rough box area
- 2D image-based biomass estimation is a valid baseline
- synthetic images can reduce labeling burden
- automatic extraction pipelines can save annotation time

### ✅ Project design lesson
This paper supports a pipeline like:

1. image acquisition  
2. segmentation  
3. geometry/coverage extraction  
4. regression to biomass

That is very compatible with your project.

---

## What does **not** transfer directly

### ❌ Not directly transferable biological target
- weed species in cotton field ≠ tomato organ parsing

### ❌ Not directly transferable label target
- individual weed biomass ≠ tomato leaf/stem/fruit biomass

### ❌ Not directly transferable scene type
- UAV field imagery ≠ likely closer-view tomato phenotyping images

---

# Relation to your specific project

Your project goal is roughly:

- classify / segment **different organs of tomato plants**
- estimate **biomass from images**
- eventually connect that to a broader agrifood / biological modeling framework

## How this paper relates

### For organ segmentation
❌ Weak direct relevance  
It does not do tomato organ segmentation.

### For biomass estimation from image outputs
✅ Strong relevance  
It directly supports using **segmentation-derived quantities** as predictors of biomass.

### For full project architecture
✅ Strong relevance  
It is a good **supporting pipeline reference**, even though the biological task is different.

---

# Can you use its code or method directly?

## Directly as-is?
❌ Probably no

Because:
- classes are different
- scene structure is different
- task is weed instance detection, not tomato organ semantic segmentation
- biomass target is different

## Adapted conceptually?
✅ Yes

You could adapt the overall logic:

- use segmentation model outputs
- compute organ mask area / shape / length features
- fit regression to biomass

That conceptual structure is definitely useful.

---

# Datasets / code / software mentioned in the paper

## Code / software explicitly mentioned

### Detectron2
Used for Mask R-CNN implementation; the paper explicitly states Detectron2 is the PyTorch-based library they used. :contentReference[oaicite:31]{index=31}

### StyleGAN2-ADA
Used for fake plant generation; the paper explicitly points to the NVIDIA implementation. :contentReference[oaicite:32]{index=32}

## Public datasets mentioned in related work
The paper mentions several public weed datasets as examples:
- WeedMap
- DeepWeeds
- The Crop/Weed Field Image dataset :contentReference[oaicite:33]{index=33}

## Availability of this paper’s own dataset
⚠️ The paper says the dataset used/analyzed is **available from the corresponding author on reasonable request**, not openly linked in the paper. :contentReference[oaicite:34]{index=34}

---

# Equipment / software / packages summary

## Hardware / imaging
- FUJIFILM GFX100, **100 MP** RGB camera
- Hylio AG-110 drone
- FUJIFILM GF 32–64 mm f/4 lens
- flight height **4.9 m**
- speed **0.61 m/s**
- shutter **1/4000 s**
- ISO **1250**
- f-stop **8**
- spatial resolution **0.0274 mm/pixel**
- image size used in training: **2048 × 2048** :contentReference[oaicite:35]{index=35} :contentReference[oaicite:36]{index=36}

## Software / packages / frameworks
- **Mask R-CNN**
- **Detectron2**
- **PyTorch**
- **StyleGAN2-ADA**
- **TensorFlow**
- transfer learning with pretrained backbones/models :contentReference[oaicite:37]{index=37} :contentReference[oaicite:38]{index=38}

## Classical image processing pieces
- Excess Greenness (ExG)
- Otsu thresholding
- morphological operations
- alpha-channel PNG generation for synthetic compositing :contentReference[oaicite:39]{index=39}

---

# Suggested way to cite/use this paper in your literature review

You can use it like this:

> This paper is not a tomato-organ phenotyping study, but it provides strong supporting evidence that segmentation-derived plant area can be used for biomass estimation. In particular, it showed that canopy mask area predicted biomass better than bounding box area, supporting the use of organ-level segmentation as an intermediate step before biomass regression. :contentReference[oaicite:40]{index=40} :contentReference[oaicite:41]{index=41}

That would be a fair and accurate use of the paper.

---

# Final takeaways

## For your project
- ❌ **Do not use this as your main tomato-organ reference**
- ✅ **Do use this as a segmentation-to-biomass reference**
- ✅ **Do use it to justify that mask-derived features are meaningful for biomass**
- ✅ **Do use it to justify synthetic data / low-label strategies**
- ⚠️ **Need additional papers specifically on tomato organ segmentation and organ-level biomass**

---

# Bottom line

## Verdict
**Useful, but indirect.**

## Best use
Use this paper as support for:
- segmentation before biomass estimation
- mask area as a biomass predictor
- synthetic image generation for limited training data

## Not enough for
- tomato organ segmentation
- tomato leaf/stem/fruit biomass estimation
- direct organ-wise agrifood modeling without additional papers

---