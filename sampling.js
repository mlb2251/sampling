"use strict";


const frame_background = d3.select('#frame-background')
const frame_foreground = d3.select('#frame-foreground')

const zoom_control = d3.zoom().on('zoom', e => frame_foreground.attr('transform', e.transform));
frame_background.call(zoom_control);
const svg_margin = 50
const SVG_WIDTH = ((window.innerWidth > 0) ? window.innerWidth : screen.width) - svg_margin * 2;
const SVG_HEIGHT = ((window.innerHeight > 0) ? window.innerHeight : screen.height) - 200;

const svg = d3.select("#svg svg")
    .attr("width", SVG_WIDTH)
    .attr("height", SVG_HEIGHT)
    .attr("transform", `translate(${svg_margin},0)`)

frame_background
    .attr("width", SVG_WIDTH)
    .attr("height", SVG_HEIGHT)


frame_foreground.append('circle')
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', 3)
    .attr('fill', 'blue');
frame_foreground.append('circle')
    .attr('cx', 100)
    .attr('cy', 0)
    .attr('r', 3)
    .attr('fill', 'blue');
frame_foreground.append('circle')
    .attr('cx', 0)
    .attr('cy', 100)
    .attr('r', 3)
    .attr('fill', 'blue');



function makeGraph(spec) {
    const xScale = d3.scaleLinear()
        .domain([spec.xmin, spec.xmax])
        .range([0, spec.width]);
    const yScale = d3.scaleLinear()
        .domain([spec.ymin, spec.ymax])
        .range([spec.height, 0]);
    const graph = frame_foreground.append("g")
        .attr("transform", `translate(${spec.x}, ${spec.y})`);
    graph.append("g")
        .attr("transform", `translate(0, ${spec.height})`)
        .call(d3.axisBottom(xScale));
    graph.append("g")
        .attr("transform", `translate(0, 0)`)
        .call(d3.axisLeft(yScale));
    return {
        xScale: xScale,
        yScale: yScale,
        g: graph,
        spec: spec
    };
}

function logaddexp(a, b) {
    if (a == -Infinity) {
        return b;
    } else if (b == -Infinity) {
        return a;
    } else {
        return Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b)));
    }
}


function run() {

    const graph = makeGraph({
        x: 100,
        y: 100,
        width: 600,
        height: 300,
        xmin: -5,
        xmax: 5,
        ymin: 0,
        ymax: 1
    })

    let proposal = {
        random: () => random_normal(1, 2),
        logpdf: (x) => logpdf_normal(x, 1, 2)
    }

    let posterior = {
        logpdf: (x) => /*Math.log(2) +*/ logpdf_mixture(x,
            [
                {logpdf: (x) => logpdf_normal(x, -2, .5)},
                {logpdf: (x) => logpdf_normal(x, 2, .5)}
            ],
            [5, 1]
        )
    }


    // take a bunch of samples from a normal distribution
    let particles = [];
    for (let i = 0; i < 400; i++) {
        let x = proposal.random();
        let logq = proposal.logpdf(x);
        let logp = posterior.logpdf(x);
        particles.push({
            x: x,
            logq: logq,
            logp: logp,
            logweight: logp - logq
        });
    }

    let opacity = 0.1;

    // let resampled = multinomial_resample(particles);
    // let resampled = residual_resample(particles);
    let resampled = residual_resample_importance(particles, x=>x);
    let total_logwt_resampled = total_logweight(resampled); // probably (always?) same as total_logwt
    let max_wt_resampled = resampled.reduce((a, b) => Math.max(a, b.logweight), -Infinity);
    let relative_max_weight_resampled = Math.exp(max_wt_resampled - total_logwt_resampled);

    let total_logwt = total_logweight(particles)
    let est_logZ = average_logweight(particles);
    let est_Z = Math.exp(est_logZ);
    console.log('estimated Z', est_Z);


    graph.g.append('text')
        .attr('x', 10)
        .attr('y', 10)
        .text(`Est Z = ${est_Z.toPrecision(3)}`)
        .attr('font-size', 20)


    let max_logwt = particles.reduce((a, b) => Math.max(a, b.logweight), -Infinity);
    let relative_max_weight = Math.exp(max_logwt - total_logwt)
    let max_particle_radius = 6;
    // let avg_particle_radius = 40;

    // plot the samples
    for (let i = 0; i < particles.length; i++) {
        let particle = particles[i];
        let relative_weight = Math.exp(particle.logweight - total_logwt);
        let area_frac = relative_weight / relative_max_weight;
        // let area_frac = relative_weight / est_Z;
        let r = max_particle_radius * Math.sqrt(area_frac);
        // let r = avg_particle_radius * Math.sqrt(area_frac);

        // posterior
        graph.g.append('circle')
            .classed("posterior", true)
            .attr('cx', graph.xScale(particle.x))
            .attr('cy', graph.yScale(Math.exp(particle.logp)))
            .attr('r', r)
            .attr('fill', 'black')
            .attr('opacity', opacity)
            .on('click', () => {
                console.log(particle)
            })
        
        // proposal
        graph.g.append('circle')
            .classed("proposal", true)
            .attr('cx', graph.xScale(particle.x))
            .attr('cy', graph.yScale(Math.exp(particle.logq)))
            .attr('r', 3)
            .attr('fill', 'blue')
            .attr('opacity', opacity);

        let num_resampled = particle.children ? particle.children.length : 0;
        // add a little bar to show how many children this particle has
        graph.g.append('rect')
            .attr('x', graph.xScale(particle.x))
            .attr('y', graph.yScale(0))
            .attr('width', 1)
            .attr('height', graph.yScale(0) - graph.yScale(3 * num_resampled/particles.length))
            .attr('fill', 'red')

        // lets plot all of the children of the particle as little red circles opacity 0.3 mirrored over the x axis from this graph, using -logp as y
        if (particle.children) {
            for (let j = 0; j < particle.children.length; j++) {
                let child = particle.children[j];
                let relative_weight = Math.exp(child.logweight - total_logwt_resampled);
                let area_frac = relative_weight / relative_max_weight_resampled;
                let r = max_particle_radius * Math.sqrt(area_frac);
    
                graph.g.append('circle')
                    .classed("child", true)
                    .attr('cx', graph.xScale(child.x))
                    .attr('cy', graph.yScale(-Math.exp(particle.logp)))
                    .attr('r', r)
                    .attr('fill', 'red')
                    .attr('opacity', opacity)
            }
        }

        // and add a little circle on end of size based on weight of first child
        // if (particle.children) {
        //     let child = particle.children[0];
        //     let relative_weight = Math.exp(child.logweight - total_logwt);
        //     let area_frac = relative_weight / relative_max_weight;
        //     let r = max_particle_radius * Math.sqrt(area_frac);
        //     graph.g.append('circle')
        //         .attr('cx', graph.xScale(child.x))
        //         .attr('cy', graph.yScale(0) + graph.yScale(0) - graph.yScale(3 * num_resampled/particles.length))
        //         .attr('r', r)
        //         .attr('fill', 'red')
        //         .attr('opacity', 0.3)
        // }
        

    }

    // plot the resampled particles
    // for (let i = 0; i < resampled; i++) {
    //     let ancestor = particles[resampled.ancestor_indices[i]];
    //     let r = 1.5;
    //     graph.g.append('circle')
    //         .classed("resampled", true)
    //         .attr('cx', graph.xScale(particle.x))
    //         .attr('cy', graph.yScale(Math.exp(particle.logp)))
    //         .attr('r', r)
    //         .attr('fill', 'red')
    //         .attr('opacity', 0.3);
    // }
    // for (let i = 0; i < resampled.particles.length; i++) {
    //     let particle = resampled.particles[i];
    //     let r = 1.5;
    //     graph.g.append('circle')
    //         .classed("resampled", true)
    //         .attr('cx', graph.xScale(particle.x))
    //         .attr('cy', graph.yScale(Math.exp(particle.logp)))
    //         .attr('r', r)
    //         .attr('fill', 'red')
    //         .attr('opacity', 0.3);
    // }

}

function logsumexp(logweights){
    return logweights.reduce((a, b) => logaddexp(a, b), -Infinity);
}

function total_logweight(particles) {
    return particles.reduce((a, b) => logaddexp(a, b.logweight), -Infinity);
}
function average_logweight(particles) {
    return total_logweight(particles) - Math.log(particles.length);
}
function normalized_logweights(particles) {
    let total_logwt = total_logweight(particles);
    return particles.map(p => p.logweight - total_logwt);
}
function normalized_weights(particles) {
    return normalized_logweights(particles).map(w => Math.exp(w));
}

function multinomial_resample(particles) {
    let N = particles.length;
    let avg_logwt = average_logweight(particles);
    let normalized_wts = normalized_weights(particles);
    let new_particles = [];
    while (new_particles.length < N) {
        let parent_idx = categorical(normalized_wts);
        new_particles.push({
            x: particles[parent_idx].x,
            logweight: avg_logwt,
        })
        set_parent_child(particles[parent_idx], new_particles[new_particles.length - 1]);
    }
    return new_particles;
}

function residual_resample(particles) {
    let N = particles.length;
    let avg_logwt = average_logweight(particles);
    let normalized_wts = normalized_weights(particles);
    let floorN_normalized_wts = normalized_wts.map(w => Math.floor(w * N));
    let residual_wts = normalized_wts.map(w => w * N - Math.floor(w * N));
    let new_particles = [];
    // add all the guaranteed particles
    for (let i = 0; i < floorN_normalized_wts.length; i++) {
        for (let j = 0; j < floorN_normalized_wts[i]; j++) {
            new_particles.push({
                x: particles[i].x,
                logweight: avg_logwt,
            })
            set_parent_child(particles[i], new_particles[new_particles.length - 1]);
        }
    }
    // now add all the ones based on residuals
    while (new_particles.length < N) {
        let i = categorical(residual_wts);
        new_particles.push({
            x: particles[i].x,
            logweight: avg_logwt,
        })
        set_parent_child(particles[i], new_particles[new_particles.length - 1]);
    }
    return new_particles;
}

function residual_resample_importance(particles, proposal) {
    let N = particles.length;
    let avg_logwt = average_logweight(particles);
    let normalized_logwts = normalized_logweights(particles);

    // calculate target/proposal importance weights where target is the residual resampling distribution
    let logpriorities = particles.map(p => proposal(p.logweight));
    let logpriority_total = logsumexp(logpriorities);
    let normalized_logpriorities = logpriorities.map(lp => lp - logpriority_total);
    let importance_logwts = normalized_logpriorities.map((_, i) => normalized_logwts[i] - normalized_logpriorities[i]);

    // residual sample from proposal
    let normalized_priorities = normalized_logpriorities.map(lp => Math.exp(lp));
    let floorN_normalized_priorities = normalized_priorities.map(w => Math.floor(w * N));
    let residual_wts = normalized_priorities.map(w => w * N - Math.floor(w * N));
    let new_particles = [];
    // add all the guaranteed particles
    for (let i = 0; i < floorN_normalized_priorities.length; i++) {
        for (let j = 0; j < floorN_normalized_priorities[i]; j++) {
            new_particles.push({
                x: particles[i].x,
                logweight: avg_logwt + importance_logwts[i],
            })
            set_parent_child(particles[i], new_particles[new_particles.length - 1]);
        }
    }
    // now add all the ones based on residuals
    while (new_particles.length < N) {
        let i = categorical(residual_wts);
        new_particles.push({
            x: particles[i].x,
            logweight: avg_logwt + importance_logwts[i],
        })
        set_parent_child(particles[i], new_particles[new_particles.length - 1]);
    }
    return new_particles;
}

function set_parent_child(parent,child) {
    if (parent.children === undefined) {
        parent.children = [];
    }
    parent.children.push(child);
    child.parent = parent;
}



function categorical(weights) {
    let total = weights.reduce((a, b) => a + b, 0);
    let normalized_weights = weights.map(w => w / total);
    let u = Math.random();
    let i = 0;
    let c = normalized_weights[0];
    while (u > c) {
        i++;
        c += normalized_weights[i];
    }
    return i;
}



// from https://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve
function random_normal(mu, sigma) {
    const u = 1 - Math.random()
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return z * sigma + mu;
}

function logpdf_normal(x, mu, sigma) {
    return -0.5 * Math.log(2 * Math.PI) - Math.log(sigma) - 0.5 * Math.pow((x - mu) / sigma, 2);
}


function logpdf_mixture(x, dists, weights) {
    let logpdf = -Infinity;
    let total = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < dists.length; i++) {
        logpdf = logaddexp(logpdf, Math.log(weights[i]/total) + dists[i].logpdf(x));
    }
    return logpdf;
}

run();
