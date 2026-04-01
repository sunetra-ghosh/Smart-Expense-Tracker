/**
 * Autoencoder Implementation (Simplified Neural Network)
 * Issue #878: Behavioral ML Anomaly Detection
 * 
 * Lightweight autoencoder for anomaly detection via reconstruction error
 */

class Matrix {
  static multiply(a, b) {
    const result = Array(a.length).fill().map(() => Array(b[0].length).fill(0));
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b[0].length; j++) {
        for (let k = 0; k < b.length; k++) {
          result[i][j] += a[i][k] * b[k][j];
        }
      }
    }
    return result;
  }

  static transpose(matrix) {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
  }

  static add(a, b) {
    return a.map((row, i) => row.map((val, j) => val + b[i][j]));
  }

  static subtract(a, b) {
    return a.map((row, i) => row.map((val, j) => val - b[i][j]));
  }

  static scale(matrix, scalar) {
    return matrix.map(row => row.map(val => val * scalar));
  }
}

class Autoencoder {
  constructor(config = {}) {
    this.inputDim = config.inputDim || 59; // From feature engineer
    this.encodingDim = config.encodingDim || 16;
    this.learningRate = config.learningRate || 0.001;
    this.epochs = config.epochs || 50;
    this.batchSize = config.batchSize || 32;
    this.validationSplit = config.validationSplit || 0.2;
    
    this.version = Date.now();
    
    // Network architecture: input -> encoding -> output
    this.encoderWeights = null;
    this.encoderBias = null;
    this.decoderWeights = null;
    this.decoderBias = null;
    
    this.trainingHistory = {
      losses: [],
      valLosses: []
    };
  }

  initializeWeights() {
    // Xavier initialization
    const encoderScale = Math.sqrt(2 / (this.inputDim + this.encodingDim));
    const decoderScale = Math.sqrt(2 / (this.encodingDim + this.inputDim));
    
    this.encoderWeights = Array(this.inputDim).fill()
      .map(() => Array(this.encodingDim).fill().map(() => (Math.random() - 0.5) * 2 * encoderScale));
    this.encoderBias = Array(this.encodingDim).fill(0);
    
    this.decoderWeights = Array(this.encodingDim).fill()
      .map(() => Array(this.inputDim).fill().map(() => (Math.random() - 0.5) * 2 * decoderScale));
    this.decoderBias = Array(this.inputDim).fill(0);
  }

  relu(x) {
    return Math.max(0, x);
  }

  reluDerivative(x) {
    return x > 0 ? 1 : 0;
  }

  sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  sigmoidDerivative(x) {
    const s = this.sigmoid(x);
    return s * (1 - s);
  }

  forward(input) {
    // Encoding
    const encoded = input.map((_, i) => {
      let sum = this.encoderBias[i % this.encodingDim];
      for (let j = 0; j < this.inputDim; j++) {
        sum += input[j] * this.encoderWeights[j][i % this.encodingDim];
      }
      return this.relu(sum);
    }).slice(0, this.encodingDim);

    // Decoding
    const decoded = input.map((_, i) => {
      let sum = this.decoderBias[i];
      for (let j = 0; j < this.encodingDim; j++) {
        sum += encoded[j] * this.decoderWeights[j][i];
      }
      return this.sigmoid(sum);
    });

    return { encoded, decoded };
  }

  computeLoss(input, output) {
    // Mean Squared Error
    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      sum += Math.pow(input[i] - output[i], 2);
    }
    return sum / input.length;
  }

  async train(data) {
    console.log(`[Autoencoder] Training on ${data.length} samples for ${this.epochs} epochs...`);
    
    // Normalize input data dimension
    if (data.length > 0 && data[0].length !== this.inputDim) {
      console.log(`[Autoencoder] Adjusting inputDim from ${this.inputDim} to ${data[0].length}`);
      this.inputDim = data[0].length;
    }

    this.initializeWeights();
    
    // Normalize data to [0, 1]
    const normalizedData = this.normalizeData(data);
    
    // Split into training and validation
    const splitIdx = Math.floor(normalizedData.length * (1 - this.validationSplit));
    const trainData = normalizedData.slice(0, splitIdx);
    const valData = normalizedData.slice(splitIdx);

    // Training loop
    for (let epoch = 0; epoch < this.epochs; epoch++) {
      let epochLoss = 0;
      const shuffled = this.shuffle([...trainData]);
      
      // Mini-batch gradient descent
      for (let i = 0; i < shuffled.length; i += this.batchSize) {
        const batch = shuffled.slice(i, Math.min(i + this.batchSize, shuffled.length));
        
        for (const sample of batch) {
          const { decoded } = this.forward(sample);
          const loss = this.computeLoss(sample, decoded);
          epochLoss += loss;
          
          // Backpropagation (simplified)
          this.updateWeights(sample, decoded);
        }
      }

      epochLoss /= trainData.length;
      
      // Validation loss
      let valLoss = 0;
      for (const sample of valData) {
        const { decoded } = this.forward(sample);
        valLoss += this.computeLoss(sample, decoded);
      }
      valLoss /= valData.length;

      this.trainingHistory.losses.push(epochLoss);
      this.trainingHistory.valLosses.push(valLoss);

      if (epoch % 10 === 0) {
        console.log(`[Autoencoder] Epoch ${epoch + 1}/${this.epochs} - Loss: ${epochLoss.toFixed(6)}, Val Loss: ${valLoss.toFixed(6)}`);
      }
    }

    console.log('[Autoencoder] Training complete');
    return this;
  }

  updateWeights(input, output) {
    // Simplified gradient descent update
    const error = input.map((val, i) => val - output[i]);
    
    // Update decoder weights
    for (let i = 0; i < this.encodingDim; i++) {
      for (let j = 0; j < this.inputDim; j++) {
        const gradient = error[j] * this.forward(input).encoded[i];
        this.decoderWeights[i][j] += this.learningRate * gradient;
      }
    }

    // Update decoder bias
    for (let i = 0; i < this.inputDim; i++) {
      this.decoderBias[i] += this.learningRate * error[i];
    }

    // Update encoder weights (simplified backprop through decoder)
    for (let i = 0; i < this.inputDim; i++) {
      for (let j = 0; j < this.encodingDim; j++) {
        let decoderError = 0;
        for (let k = 0; k < this.inputDim; k++) {
          decoderError += error[k] * this.decoderWeights[j][k];
        }
        const gradient = decoderError * input[i];
        this.encoderWeights[i][j] += this.learningRate * gradient * 0.5;
      }
    }
  }

  predict(point) {
    if (!this.encoderWeights) {
      throw new Error('Model not trained yet');
    }

    // Normalize input
    const normalized = this.normalizePoint(point);
    
    // Get reconstruction
    const { decoded } = this.forward(normalized);
    
    // Calculate reconstruction error as anomaly score
    const error = this.computeLoss(normalized, decoded);
    
    // Normalize to [0, 1] range (higher error = higher anomaly score)
    // Typical reconstruction errors are in range [0, 0.5]
    return Math.min(1, error * 2);
  }

  predictBatch(points) {
    return points.map(point => this.predict(point));
  }

  normalizeData(data) {
    // Min-max normalization to [0, 1]
    const mins = Array(data[0].length).fill(Infinity);
    const maxs = Array(data[0].length).fill(-Infinity);

    data.forEach(point => {
      point.forEach((val, i) => {
        mins[i] = Math.min(mins[i], val);
        maxs[i] = Math.max(maxs[i], val);
      });
    });

    this.normalizationParams = { mins, maxs };

    return data.map(point => 
      point.map((val, i) => {
        const range = maxs[i] - mins[i];
        return range > 0 ? (val - mins[i]) / range : 0;
      })
    );
  }

  normalizePoint(point) {
    if (!this.normalizationParams) {
      return point;
    }

    const { mins, maxs } = this.normalizationParams;
    return point.map((val, i) => {
      const range = maxs[i] - mins[i];
      return range > 0 ? (val - mins[i]) / range : 0;
    });
  }

  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  getPerformanceMetrics() {
    return {
      inputDim: this.inputDim,
      encodingDim: this.encodingDim,
      epochs: this.epochs,
      finalLoss: this.trainingHistory.losses[this.trainingHistory.losses.length - 1],
      finalValLoss: this.trainingHistory.valLosses[this.trainingHistory.valLosses.length - 1],
      version: this.version,
      trained: this.encoderWeights !== null
    };
  }

  getVersion() {
    return this.version.toString();
  }

  serialize() {
    return {
      config: {
        inputDim: this.inputDim,
        encodingDim: this.encodingDim,
        learningRate: this.learningRate,
        epochs: this.epochs,
        batchSize: this.batchSize
      },
      version: this.version,
      encoderWeights: this.encoderWeights,
      encoderBias: this.encoderBias,
      decoderWeights: this.decoderWeights,
      decoderBias: this.decoderBias,
      normalizationParams: this.normalizationParams,
      trainingHistory: this.trainingHistory
    };
  }

  deserialize(data) {
    this.inputDim = data.config.inputDim;
    this.encodingDim = data.config.encodingDim;
    this.learningRate = data.config.learningRate;
    this.epochs = data.config.epochs;
    this.batchSize = data.config.batchSize;
    this.version = data.version;
    this.encoderWeights = data.encoderWeights;
    this.encoderBias = data.encoderBias;
    this.decoderWeights = data.decoderWeights;
    this.decoderBias = data.decoderBias;
    this.normalizationParams = data.normalizationParams;
    this.trainingHistory = data.trainingHistory;
  }
}

module.exports = Autoencoder;
