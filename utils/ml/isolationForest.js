/**
 * Isolation Forest Implementation
 * Issue #878: Behavioral ML Anomaly Detection
 * 
 * Unsupervised anomaly detection using Isolation Forest algorithm
 */

class IsolationTree {
  constructor(maxDepth, sampleSize) {
    this.maxDepth = maxDepth;
    this.sampleSize = sampleSize;
    this.root = null;
  }

  train(data) {
    // Subsample data
    const sample = this.subsample(data, this.sampleSize);
    this.root = this.buildTree(sample, 0);
  }

  buildTree(data, depth) {
    // Base cases
    if (depth >= this.maxDepth || data.length <= 1) {
      return { type: 'leaf', size: data.length };
    }

    // Randomly select feature and split value
    const featureIndex = Math.floor(Math.random() * data[0].length);
    const values = data.map(point => point[featureIndex]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    
    if (minVal === maxVal) {
      return { type: 'leaf', size: data.length };
    }

    const splitValue = minVal + Math.random() * (maxVal - minVal);

    // Split data
    const leftData = data.filter(point => point[featureIndex] < splitValue);
    const rightData = data.filter(point => point[featureIndex] >= splitValue);

    if (leftData.length === 0 || rightData.length === 0) {
      return { type: 'leaf', size: data.length };
    }

    return {
      type: 'node',
      featureIndex,
      splitValue,
      left: this.buildTree(leftData, depth + 1),
      right: this.buildTree(rightData, depth + 1)
    };
  }

  pathLength(point, node = this.root, depth = 0) {
    if (!node) return depth;
    
    if (node.type === 'leaf') {
      return depth + this.adjustedLength(node.size);
    }

    if (point[node.featureIndex] < node.splitValue) {
      return this.pathLength(point, node.left, depth + 1);
    } else {
      return this.pathLength(point, node.right, depth + 1);
    }
  }

  adjustedLength(size) {
    if (size <= 1) return 0;
    // Average path length in a binary search tree
    return 2 * (Math.log(size - 1) + 0.5772156649) - (2 * (size - 1) / size);
  }

  subsample(data, size) {
    if (data.length <= size) return [...data];
    
    const sample = [];
    const indices = new Set();
    
    while (sample.length < size) {
      const idx = Math.floor(Math.random() * data.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        sample.push(data[idx]);
      }
    }
    
    return sample;
  }
}

class IsolationForest {
  constructor(config = {}) {
    this.nTrees = config.nTrees || 100;
    this.sampleSize = config.sampleSize || 256;
    this.maxTreeDepth = config.maxTreeDepth || 12;
    this.contamination = config.contamination || 0.05;
    this.trees = [];
    this.version = Date.now();
    this.averagePathLength = null;
  }

  async train(data) {
    console.log(`[IsolationForest] Training ${this.nTrees} trees on ${data.length} samples...`);
    
    this.trees = [];
    
    // Train multiple isolation trees
    for (let i = 0; i < this.nTrees; i++) {
      const tree = new IsolationTree(this.maxTreeDepth, this.sampleSize);
      tree.train(data);
      this.trees.push(tree);
      
      if (i % 20 === 0) {
        console.log(`[IsolationForest] Trained ${i + 1}/${this.nTrees} trees`);
      }
    }

    // Calculate average path length for normalization
    this.averagePathLength = this.calculateAveragePathLength(this.sampleSize);
    
    console.log('[IsolationForest] Training complete');
    return this;
  }

  predict(point) {
    if (this.trees.length === 0) {
      throw new Error('Model not trained yet');
    }

    // Calculate average path length across all trees
    const pathLengths = this.trees.map(tree => tree.pathLength(point));
    const avgPath = pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length;

    // Anomaly score: normalized by expected path length
    const score = Math.pow(2, -avgPath / this.averagePathLength);

    // Clamp to [0, 1] range
    return Math.max(0, Math.min(1, score));
  }

  predictBatch(points) {
    return points.map(point => this.predict(point));
  }

  calculateAveragePathLength(n) {
    if (n <= 1) return 0;
    return 2 * (Math.log(n - 1) + 0.5772156649) - (2 * (n - 1) / n);
  }

  getPerformanceMetrics() {
    return {
      nTrees: this.nTrees,
      sampleSize: this.sampleSize,
      maxTreeDepth: this.maxTreeDepth,
      version: this.version,
      trained: this.trees.length > 0
    };
  }

  getVersion() {
    return this.version.toString();
  }

  serialize() {
    // Serialize model for storage
    return {
      config: {
        nTrees: this.nTrees,
        sampleSize: this.sampleSize,
        maxTreeDepth: this.maxTreeDepth,
        contamination: this.contamination
      },
      version: this.version,
      averagePathLength: this.averagePathLength,
      trees: this.trees.map(tree => this.serializeTree(tree.root))
    };
  }

  serializeTree(node) {
    if (!node) return null;
    
    if (node.type === 'leaf') {
      return { type: 'leaf', size: node.size };
    }
    
    return {
      type: 'node',
      featureIndex: node.featureIndex,
      splitValue: node.splitValue,
      left: this.serializeTree(node.left),
      right: this.serializeTree(node.right)
    };
  }

  deserialize(data) {
    this.nTrees = data.config.nTrees;
    this.sampleSize = data.config.sampleSize;
    this.maxTreeDepth = data.config.maxTreeDepth;
    this.contamination = data.config.contamination;
    this.version = data.version;
    this.averagePathLength = data.averagePathLength;
    
    this.trees = data.trees.map(treeData => {
      const tree = new IsolationTree(this.maxTreeDepth, this.sampleSize);
      tree.root = this.deserializeTree(treeData);
      return tree;
    });
  }

  deserializeTree(data) {
    if (!data) return null;
    
    if (data.type === 'leaf') {
      return { type: 'leaf', size: data.size };
    }
    
    return {
      type: 'node',
      featureIndex: data.featureIndex,
      splitValue: data.splitValue,
      left: this.deserializeTree(data.left),
      right: this.deserializeTree(data.right)
    };
  }
}

module.exports = IsolationForest;
