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

function propose(Q, P, N) {
    return Array(N).fill(0).map(() => {
        let x = Q.random();
        return {
            x: x,
            logweight: P.logpdf(x) - Q.logpdf(x)
        }
    });
}

function reweight(particles, P, Q) {
    return particles.map(particle => ({
        x: particle.x,
        logweight: particle.logweight + P.logpdf(particle.x) - Q.logpdf(particle.x)
    }))
}

function run() {
    // example graph
    let algo_result = importance_sampling_example(200);
    graph_IS(algo_result);

    // scalling number of particles
    console.log("IS with 100 particles")
    evaluate_algorithm(() => importance_sampling_example(100), 1000);
    console.log("IS with 200 particles")
    evaluate_algorithm(() => importance_sampling_example(200), 1000);
    console.log("IS with 500 particles")
    evaluate_algorithm(() => importance_sampling_example(500), 1000);

    // better proposal (less badly offset)
    console.log("=====================================")
    console.log("Ok proposal")
    evaluate_algorithm(() => importance_sampling_example(200), 2000);
    console.log("Better proposal")
    evaluate_algorithm(() => importance_sampling_example(200, normal(0,2)), 2000);

}

function importance_sampling_example(N, proposal = normal(1,2)) {
    let posterior = temperature(mixture(
        [
            normal(-2, .5),
            normal(2, .5)
        ],
        [5,1]
    ),1)
    let particles = propose(proposal, posterior, N);
    let resampled = residual_resample_importance(particles, x=>x);
    return {
        particles: particles,
        resampled: resampled,
        proposal: proposal,
        posterior: posterior
    }
}

function graph_IS(IS_result) {
    let {particles, resampled, proposal, posterior} = IS_result;
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
    plot_particles(particles, graph, x => Math.exp(proposal.logpdf(x)), 'blue', true)
    graph.g.append('text').text('Proposal').attr('x', graph.spec.width).attr('y',0).attr('fill', 'blue')
    plot_particles(particles, graph, x => Math.exp(posterior.logpdf(x)), 'black')
    graph.g.append('text').text('Posterior').attr('x', graph.spec.width).attr('y',20).attr('fill', 'black')
    plot_particles(resampled, graph, x => -Math.exp(posterior.logpdf(x)), 'red')
    graph.g.append('text').text('Resampled (flipped)').attr('x', graph.spec.width).attr('y',40).attr('fill', 'red')

    // add bars showing resample counts
    for (let particle of particles) {
        let num_resampled = particle.children ? particle.children.length : 0;
        graph.g.append('rect')
            .attr('x', graph.xScale(particle.x))
            .attr('y', graph.yScale(0))
            .attr('width', 1)
            .attr('height', graph.yScale(0) - graph.yScale(3 * num_resampled/particles.length))
            .attr('fill', 'red')
    }

    // display Z estimate
    let log_mean_wt = log_mean_weight(particles);
    let Z_est = Math.exp(log_mean_wt);
    graph.g.append('text')
        .attr('x', 10)
        .attr('y', 10)
        .text(`Z ≈ ${Z_est.toPrecision(3)}`)
    graph.g.append('text')
        .attr('x', 10)
        .attr('y', 30)
        .text(`log mean w = ${log_mean_wt.toPrecision(3)}`)
}

function evaluate_algorithm(algorithm, M=1000) {
    let log_mean_wts = [];
    for (let i=0; i<M; i++) {
        let particles = algorithm().particles;
        log_mean_wts.push(log_mean_weight(particles));
    }

    let z_estimates = log_mean_wts.map(w => Math.exp(w));
    let avg_z_est = z_estimates.reduce((a, b) => a + b, 0) / M;
    let avg_log_mean_wt = log_mean_wts.reduce((a, b) => a + b, 0) / M;
    // console.log("E[mean w]", avg_z_est)
    // console.log("log E[mean w]", Math.log(avg_z_est))
    console.log("E[log mean w]", avg_log_mean_wt)
    // console.log("KL div = ", avg_log_mean_wt - Math.log(avg_z_est))
    return {
        E_mean_w: avg_z_est,
        log_E_mean_w: Math.log(avg_z_est),
        E_log_mean_w: avg_log_mean_wt,
        est_KLD: avg_log_mean_wt - Math.log(avg_z_est),
    }
}



function plot_particles(particles, graph, y_func = x => 0, fill='black', fix_size=false, opacity=0.1,  max_particle_radius = 6) {
    // calculate some stats useful for plotting reasonable sized circles
    let total_logwt = total_logweight(particles)
    let max_logwt = particles.reduce((a, b) => Math.max(a, b.logweight), -Infinity);
    let relative_max_weight = Math.exp(max_logwt - total_logwt)

    let g_particles = graph.g.append('g')

    // plot the samples
    for (let i = 0; i < particles.length; i++) {
        let particle = particles[i];
        // calc radius such that circle area is proportional to weight
        let relative_weight = Math.exp(particle.logweight - total_logwt);
        let area_frac = relative_weight / relative_max_weight;
        let r = max_particle_radius * Math.sqrt(area_frac);
        if (fix_size) {
            r = max_particle_radius/2;
        }
        
        g_particles.append('circle')
            .classed("particle", true)
            .attr('cx', graph.xScale(particle.x))
            .attr('cy', graph.yScale(y_func(particle.x)))
            .attr('r', r)
            .attr('fill', fill)
            .attr('opacity', opacity)
            .on('click', () => {
                console.log(particle)
            })
    }
    return {
        g: g_particles,
    }
}


function logsumexp(logweights){
    return logweights.reduce((a, b) => logaddexp(a, b), -Infinity);
}
function logmeanexp(logweights){
    return logsumexp(logweights) - Math.log(logweights.length);
}

function total_logweight(particles) {
    return particles.reduce((a, b) => logaddexp(a, b.logweight), -Infinity);
}
function log_mean_weight(particles) {
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
    let Z_est = log_mean_weight(particles);
    let normalized_wts = normalized_weights(particles);
    let new_particles = [];
    while (new_particles.length < N) {
        let parent_idx = categorical(normalized_wts);
        new_particles.push({
            x: particles[parent_idx].x,
            logweight: Z_est,
        })
        set_parent_child(particles[parent_idx], new_particles[new_particles.length - 1]);
    }
    return new_particles;
}

function residual_resample(particles) {
    let N = particles.length;
    let Z_est = log_mean_weight(particles);
    let normalized_wts = normalized_weights(particles);
    let floorN_normalized_wts = normalized_wts.map(w => Math.floor(w * N));
    let residual_wts = normalized_wts.map(w => w * N - Math.floor(w * N));
    let new_particles = [];
    // add all the guaranteed particles
    for (let i = 0; i < floorN_normalized_wts.length; i++) {
        for (let j = 0; j < floorN_normalized_wts[i]; j++) {
            new_particles.push({
                x: particles[i].x,
                logweight: Z_est,
            })
            set_parent_child(particles[i], new_particles[new_particles.length - 1]);
        }
    }
    // now add all the ones based on residuals
    while (new_particles.length < N) {
        let i = categorical(residual_wts);
        new_particles.push({
            x: particles[i].x,
            logweight: Z_est,
        })
        set_parent_child(particles[i], new_particles[new_particles.length - 1]);
    }
    return new_particles;
}

function residual_resample_importance(particles, proposal) {
    let N = particles.length;
    let Z_est = log_mean_weight(particles);
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
                logweight: Z_est + importance_logwts[i]
            })
            set_parent_child(particles[i], new_particles[new_particles.length - 1]);
        }
    }
    // now add all the ones based on residuals
    while (new_particles.length < N) {
        let i = categorical(residual_wts);
        new_particles.push({
            x: particles[i].x,
            logweight: Z_est + importance_logwts[i],
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

function temperature(dist, T) {
    return {
        random: () => {throw new Error('temperature() doesnt support random')},
        logpdf: (x) => dist.logpdf(x) / T
    }
}

function mixture(dists, weights) {
    return {
        random: () => {
            let i = categorical(weights);
            return dists[i].random();
        },
        logpdf: (x) => logpdf_mixture(x, dists, weights)
    }
}

function normal(mu, sigma) {
    return {
        random: () => random_normal(mu, sigma),
        logpdf: (x) => logpdf_normal(x, mu, sigma)
    }
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
