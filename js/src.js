import fragment from './shaders/fragment.glsl';
import vertex from './shaders/vertex.glsl';

import GyroNorm from './lib/gyronorm';
const gn = new GyroNorm.GyroNorm();

export default class Sketch {
  constructor() {
    this.container = document.getElementById('gl');
    this.canvas = document.createElement('canvas');
    this.container.appendChild(this.canvas);
    this.gl = this.canvas.getContext('webgl');
    this.ratio = window.devicePixelRatio;
    this.windowWidth = window.innerWidth;
    this.windowHeight = window.innerHeight;
    this.mouseX = 0;
    this.mouseY = 0;

    this.mouseTargetX = 0;
    this.mouseTargetY = 0;

    this.imageOriginal = this.container.getAttribute('data-imageOriginal');
    this.imageDepth = this.container.getAttribute('data-imageDepth');
    this.vth = this.container.getAttribute('data-verticalThreshold');
    this.hth = this.container.getAttribute('data-horizontalThreshold');

    this.imageURLs = [
      this.imageOriginal,
      this.imageDepth
    ];
    this.textures = [];

    // colors
    // #575757
    // #787878
    // #a7a7a7
    // #b7b7b7
    // #d6d6d6
    // #f7f7f7

    this.startTime = new Date().getTime(); // Get start time for animating

    this.createScene();
    this.addTexture();
    this.mouseMove();
    this.gyro();
  }

  addShader( source, type ) {
	  let shader = this.gl.createShader( type );
	  this.gl.shaderSource( shader, source );
	  this.gl.compileShader( shader );
	  let isCompiled = this.gl.getShaderParameter( shader, this.gl.COMPILE_STATUS );
	  if ( !isCompiled ) {
	    throw new Error( 'Shader compile error: ' + this.gl.getShaderInfoLog( shader ) );
	  }
	  this.gl.attachShader( this.program, shader );
  }

  resizeHandler() {
  	this.windowWidth = window.innerWidth;
  	this.windowHeight = window.innerHeight;
    this.width = this.container.offsetWidth;
    // this.height = this.width/this.aspect;
    this.height = this.container.offsetHeight;

    this.canvas.width = this.width*this.ratio;
    this.canvas.height = this.height*this.ratio;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    let a1,a2;
    if(this.height/this.width<this.imageAspect) {
      a1 = 1;
      a2 = (this.height/this.width) / this.imageAspect;
    } else{
      a1 = (this.width/this.height) * this.imageAspect ;
      a2 = 1;
    }
    this.uResolution.set( this.width, this.height, a1, a2 );
    this.uRatio.set( 1/this.ratio );
    this.uThreshold.set( this.hth, this.vth );
    this.gl.viewport( 0, 0, this.width*this.ratio, this.height*this.ratio );
  }

  resize() {
  	this.resizeHandler();
    window.addEventListener( 'resize', this.resizeHandler.bind(this) );
  }

  createScene() {
    // create program
    this.program = this.gl.createProgram();
    // add shaders
    this.addShader( vertex, this.gl.VERTEX_SHADER );
    this.addShader( fragment, this.gl.FRAGMENT_SHADER );
    // link & use program
    this.gl.linkProgram( this.program );
    this.gl.useProgram( this.program );

    // create fragment uniforms
    this.uResolution = new Uniform( 'resolution', '4f' , this.program, this.gl );
    this.uMouse = new Uniform( 'mouse', '2f' , this.program, this.gl );
    this.uTime = new Uniform( 'time', '1f' , this.program, this.gl );
    this.uRatio = new Uniform( 'pixelRatio', '1f' , this.program, this.gl );
    this.uThreshold = new Uniform( 'threshold', '2f' , this.program, this.gl );
    // create position attrib
    this.billboard = new Rect( this.gl );
    this.positionLocation = this.gl.getAttribLocation( this.program, 'a_position' );
    this.gl.enableVertexAttribArray( this.positionLocation );
    this.gl.vertexAttribPointer( this.positionLocation, 2, this.gl.FLOAT, false, 0, 0 );
  }

  addTexture() {
  	let that = this;
    let gl = that.gl;
    loadImages(this.imageURLs, that.start.bind(this));
  }

  start(images) {
    let that = this;
    let gl = that.gl;

    // connect images
    this.imageAspect = images[0].naturalHeight/images[0].naturalWidth;
    for (var i = 0; i < images.length; i++) {
      

      let texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      // Set the parameters so we can render any size image.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Upload the image into the texture.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]);
      this.textures.push(texture);
    }

    // lookup the sampler locations.
    let u_image0Location = this.gl.getUniformLocation(this.program, 'image0');
    let u_image1Location = this.gl.getUniformLocation(this.program, 'image1');

    // set which texture units to render with.
    this.gl.uniform1i(u_image0Location, 0); // texture unit 0
    this.gl.uniform1i(u_image1Location, 1); // texture unit 1

    // Set each texture unit to use a particular texture.
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[0]);
    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[1]);


    // start application
    this.resize();
    this.render();
  }


  gyro() {
    // this.calibrated = false;
    let that = this;

    this.maxTilt = 15;
    // setInterval(() => {
    //   this.calibrated = false;
    // },20000);

    // window.addEventListener('deviceorientation', (e) => {
    //   if(!this.calibrated) {
    //     this.startBeta = e.beta.toFixed(2);
    //     this.startGamma = e.gamma.toFixed(2);
    //     this.calibrated = true;
    //   }
    //   // console.log(e.beta.toFixed(1),e.gamma.toFixed(1));
    //   this.mouseTargetY = clamp(this.startBeta - e.beta,-this.maxTilt, this.maxTilt)/this.maxTilt;
    //   this.mouseTargetX = -clamp(this.startGamma - e.gamma,-this.maxTilt, this.maxTilt)/this.maxTilt;
    //   console.log(this.mouseTargetX.toFixed(1),this.mouseTargetY.toFixed(1));
    // }, true);

    const rotationCoef = 0.15;

    gn.init({ gravityNormalized: true }).then(function() {
      gn.start(function(data) {

        let y = data.do.gamma;
        let x = data.do.beta;

        that.mouseTargetY = clamp(x,-that.maxTilt, that.maxTilt)/that.maxTilt;
        that.mouseTargetX = -clamp(y,-that.maxTilt, that.maxTilt)/that.maxTilt;

      });
    }).catch(function(e) {
      console.log('not supported');
      // Catch if the DeviceOrientation or DeviceMotion is not supported by the browser or device
    });

  }

  mouseMove() {
  	let that = this;
  	document.addEventListener('mousemove', function(e) {
      let halfX = that.windowWidth/2;
      let halfY = that.windowHeight/2;

  		that.mouseTargetX = (halfX - e.clientX)/halfX;
  		that.mouseTargetY = (halfY - e.clientY)/halfY;

      
  	});
  }


  render() {
    let now = new Date().getTime();
    let currentTime = ( now - this.startTime ) / 1000;
    this.uTime.set( currentTime );
    // inertia
    this.mouseX += (this.mouseTargetX - this.mouseX)*0.05;
    this.mouseY += (this.mouseTargetY - this.mouseY)*0.05;


    this.uMouse.set( this.mouseX, this.mouseY );

    // render
    this.billboard.render( this.gl );
    requestAnimationFrame( this.render.bind(this) );
  }
}

function loadImage(url, callback) {
  var image = new Image();
  image.src = url;
  image.onload = callback;
  return image;
}
function loadImages(urls, callback) {
  var images = [];
  var imagesToLoad = urls.length;
 
  // Called each time an image finished loading.
  var onImageLoad = function() {
    --imagesToLoad;
    // If all the images are loaded call the callback.
    if (imagesToLoad === 0) {
      callback(images);
    }
  };
 
  for (var ii = 0; ii < imagesToLoad; ++ii) {
    var image = loadImage(urls[ii], onImageLoad);
    images.push(image);
  }
}
function Uniform( name, suffix, program,gl ) {
  this.name = name;
  this.suffix = suffix;
  this.gl = gl;
  this.program = program;
  this.location = gl.getUniformLocation( program, name );
}

Uniform.prototype.set = function( ...values ) {
  let method = 'uniform' + this.suffix;
  let args = [ this.location ].concat( values );
  this.gl[ method ].apply( this.gl, args );
};

// ----- Rect ----- //
function Rect( gl ) {
  var buffer = gl.createBuffer();
  gl.bindBuffer( gl.ARRAY_BUFFER, buffer );
  gl.bufferData( gl.ARRAY_BUFFER, Rect.verts, gl.STATIC_DRAW );
}

Rect.verts = new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  1, 1,
]);

Rect.prototype.render = function( gl ) {
  gl.drawArrays( gl.TRIANGLE_STRIP, 0, 4 );
};
function clamp(number, lower, upper) {
  if (number === number) {
    if (upper !== undefined) {
      number = number <= upper ? number : upper;
    }
    if (lower !== undefined) {
      number = number >= lower ? number : lower;
    }
  }
  return number;
}
new Sketch();
